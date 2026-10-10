export function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-xl rounded-[22px] rounded-tr-md bg-ink px-5 py-4 text-[15px] leading-relaxed text-white">{text}</div>
    </div>
  );
}
