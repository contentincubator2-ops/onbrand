import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchProductMeta } from "./productMeta";
import { assertUrlSafe } from "../../content/core/urlGuard";

vi.mock("../../content/core/urlGuard", () => ({ assertUrlSafe: vi.fn(async (url: string) => new URL(url)) }));

function mockHtml(html: string) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  })));
}

describe("fetchProductMeta", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("reads an IRIS-style JSON-LD Product from @graph", async () => {
    mockHtml(`<!doctype html><html><head>
      <script type="application/ld+json">{
        "@context":"https://schema.org","@graph":[
          {"@type":"WebSite","name":"IRIS"},
          {"@type":"Product","name":"IRIS 提包","image":["http://cdn.iris.com.tw/bag.jpg"],
           "description":"經典提包","offers":{"@type":"Offer","price":"3090","priceCurrency":"TWD"}}
        ]}
      </script>
      <meta property="og:title" content="fallback title">
    </head></html>`);

    await expect(fetchProductMeta("https://www.iris.com.tw/SalePage/Index/11684152")).resolves.toEqual({
      name: "IRIS 提包",
      imageUrl: "https://cdn.iris.com.tw/bag.jpg",
      price: "3090",
      currency: "TWD",
      description: "經典提包",
      source: "jsonld",
    });
  });

  it("ignores momo-style ProductGroup JSON-LD and reads OG tags in either attribute order", async () => {
    mockHtml(`<!doctype html><html><head>
      <script type='application/ld+json'>{"@type":"ProductGroup","name":"group only"}</script>
      <meta content="momo 商品名稱" property="og:title">
      <meta content="http://img.momoshop.com.tw/goods.jpg?x=1&amp;y=2" property="og:image">
      <meta content="590" property="product:price:amount">
      <meta property="product:price:currency" content="TWD">
      <meta name="og:description" content="momo 商品說明">
    </head></html>`);

    await expect(fetchProductMeta("https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=15254975")).resolves.toEqual({
      name: "momo 商品名稱",
      imageUrl: "https://img.momoshop.com.tw/goods.jpg?x=1&y=2",
      price: "590",
      currency: "TWD",
      description: "momo 商品說明",
      source: "og",
    });
  });

  it("reads a Shopline-style Product and normalizes its relative entity-encoded image", async () => {
    mockHtml(`<!doctype html><html><head>
      <script data-extra="1" type="application/ld+json">[
        {"@type":["Thing","Product"],"name":"Ansuz PowerSwitch A3","image":{"url":"/images/a3.jpg?width=800&amp;v=2"},"offers":[{"price":null,"priceCurrency":"TWD"}]}
      ]</script>
      <meta property="og:description" content="丹麥高階網路交換器">
    </head></html>`);

    await expect(fetchProductMeta("https://yoursound.shoplineapp.com/products/a3")).resolves.toEqual({
      name: "Ansuz PowerSwitch A3",
      imageUrl: "https://yoursound.shoplineapp.com/images/a3.jpg?width=800&v=2",
      price: undefined,
      currency: "TWD",
      description: "丹麥高階網路交換器",
      source: "jsonld",
    });
  });

  it("drops a zero price (call-for-price listings) instead of persisting NT$0", async () => {
    mockHtml(`<html><head>
      <script type="application/ld+json">{"@type":"Product","name":"電洽商品",
        "image":"https://img.example.com/a.jpg","offers":{"@type":"Offer","price":0,"priceCurrency":"TWD"}}</script>
      <meta property="product:price:amount" content="0">
    </head></html>`);
    const meta = await fetchProductMeta("https://shop.example.com/products/x");
    expect(meta.source).toBe("jsonld");
    expect(meta.name).toBe("電洽商品");
    expect(meta.price).toBeUndefined();
  });

  it("returns none rather than throwing and validates the requested URL", async () => {
    vi.mocked(assertUrlSafe).mockRejectedValueOnce(new Error("blocked"));
    await expect(fetchProductMeta("http://127.0.0.1/private")).resolves.toEqual({ source: "none" });
    expect(assertUrlSafe).toHaveBeenCalledWith("http://127.0.0.1/private");
  });
});
