/**
 * squadLeadRouter — tRPC endpoint for the Squad Lead chat panel.
 *
 * Called by FeedbackPanel in PickerWorkspace when the user sends a message.
 * Supports any provider / model, defaults to auto-routing via multiModelRouter.
 * When provider="hermes" it calls the local Hermes Agent FastAPI wrapper.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { callModel } from "../_core/multiModelRouter";

export const squadLeadRouter = router({
  chat: protectedProcedure
    .input(
      z.object({
        /** The user's message */
        message: z.string().min(1).max(4000),
        /** System prompt — built by the client with session context */
        system: z.string().optional(),
        /** Explicit model id (e.g. "claude-sonnet-4-6", "hermes") */
        model: z.string().optional(),
        /** Explicit provider (e.g. "hermes", "azure-position") */
        provider: z.string().optional(),
        /** Prior conversation turns for non-Hermes models */
        messages: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { message, system, model, provider, messages = [] } = input;

      // Build full message list
      const fullMessages = [
        ...(system ? [{ role: "system" as const, content: system }] : []),
        ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: message },
      ];

      let content: string;

      if (provider && provider !== "auto") {
        // Explicit provider requested (includes "hermes")
        const result = await invokeLLM({
          provider: provider as any,
          model: model ?? undefined,
          messages: fullMessages,
          maxTokens: 1024,
        });
        const raw = result.choices?.[0]?.message?.content;
        content = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((c: any) => c.text ?? "").join("") : "";
      } else {
        // Auto-route via multiModelRouter
        const result = await callModel(
          fullMessages.map((m) => ({
            role: m.role as "user" | "assistant" | "system",
            content: m.content,
          })),
          "general"
        );
        content = result.content;
      }

      return { content, text: content };
    }),
});
