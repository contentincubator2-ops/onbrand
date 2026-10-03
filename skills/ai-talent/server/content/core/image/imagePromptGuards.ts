/**
 * Dominant guard blocks appended after the synthesized visual brief.
 * Kept pure so product-fidelity and non-product safety rules cannot drift
 * unnoticed inside the orchestra's image-generation implementation.
 */
export function buildImageGuardBlock(args: {
  subjectMode: boolean;
  productFaithfulBlock: string;
  noMirrorBlock: string;
}): string {
  if (args.subjectMode) {
    // The attached product is customer-owned source-of-truth. A blanket logo
    // ban here would erase its real trademark, so preserve its markings while
    // excluding only unrelated generated typography. The fidelity wording is
    // supplied from imageGen.ts so its closed text rule has one source of truth.
    return `${args.productFaithfulBlock}\n\n${args.noMirrorBlock}`;
  }

  // Imagen 4 has no negative-prompt support. Give competitor-logo avoidance
  // its own high-salience positive block instead of burying "logos" inside
  // the long no-text list.
  const brandSafetyBlock =
    "BRAND SAFETY — Render every garment, shoe, accessory, and product as " +
    "generic, unbranded, and plain. Use only original, non-branded shapes and " +
    "surface details. Keep the scene entirely free of real-world brand logos, " +
    "wordmarks, or recognizable signature design elements, including swooshes, " +
    "three-stripe motifs, branded check patterns, and other competitor identifiers. " +
    "When the caption names a product category, use a neutral generic design rather " +
    "than visual traits from that category's best-known brands.";

  const noTextBlock =
    "ABSOLUTELY NO TEXT: render zero written characters — no text, letters, " +
    "words, numbers, Chinese/Japanese/Korean characters, titles, headlines, " +
    "captions, labels, badges, signage, watermarks or typography anywhere. " +
    "Leave any title area as empty visual space; text is added later on a separate layer.";

  return `${brandSafetyBlock}\n\n${noTextBlock}\n\n${args.noMirrorBlock}`;
}
