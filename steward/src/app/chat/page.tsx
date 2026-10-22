import { ChatClient } from "@/components/ChatClient";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-8 pt-6 pb-3 border-b border-line shrink-0">
        <h1 className="font-display text-[22px] text-ink font-semibold">Ask about the books</h1>
        <p className="font-ui text-[12.5px] text-ink3 mt-0.5">
          Questions about the church&apos;s finances, answered from the synced Aplos ledger.
        </p>
      </div>
      <ChatClient />
    </div>
  );
}
