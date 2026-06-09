import UploadForm from "./upload-form";

const TRUST = [
  { icon: "⏱", title: "자동 만료", desc: "정한 TTL이 지나면 링크가 스스로 사라져요." },
  { icon: "🔒", title: "열람 잠금", desc: "비밀번호를 아는 사람만 문서를 열 수 있어요." },
  { icon: "🔗", title: "즉시 링크", desc: "업로드하면 바로 공유 링크가 생성돼요." },
] as const;

export default function Home() {
  return (
    <main className="mx-auto grid max-w-5xl gap-10 px-5 pt-12 pb-16 md:grid-cols-2 md:items-start md:gap-12">
      <section>
        <h1 className="text-3xl font-extrabold leading-tight text-ink">
          HTML을 올리면,
          <br />
          바로 공유 링크
        </h1>
        <p className="mt-3 text-ink-2">
          정한 시간이 지나면 자동으로 만료됩니다. 재배포 없이 즉시 공유하세요.
        </p>
        <ul className="mt-8 flex flex-col gap-3">
          {TRUST.map((item) => (
            <li
              key={item.title}
              className="flex items-start gap-3 rounded-2xl border border-line bg-white p-4"
            >
              <span className="text-xl" aria-hidden="true">{item.icon}</span>
              <div>
                <p className="font-bold text-ink">{item.title}</p>
                <p className="mt-0.5 text-sm text-ink-3">{item.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="md:pt-2">
        <UploadForm />
      </section>
    </main>
  );
}
