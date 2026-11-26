export default function LogoMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M20 20h20v6H26v14h-6zM80 20v20h-6V26H60v-6zM20 80V60h6v14h14v6zM80 80H60v-6h14V60h6z" />
      <path fill="currentColor" fillRule="evenodd" d="M36 36h28v28H36zm7 7v14h14V43z" />
      <path fill="currentColor" d="M47 47h6v6h-6z" />
    </svg>
  );
}
