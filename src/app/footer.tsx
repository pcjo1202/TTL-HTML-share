import { GITHUB_URL } from "@/lib/site";

export default function Footer() {
  return (
    <footer className="mx-auto max-w-5xl px-5 py-8 text-center text-xs text-ink-3">
      <p>
        TTL HTML Share · 오픈소스 ·{" "}
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-ink-2 hover:text-toss-blue"
        >
          GitHub
        </a>
      </p>
    </footer>
  );
}
