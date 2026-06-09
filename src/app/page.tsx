import UploadForm from "./upload-form";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-5 pt-8 pb-12">
      <h1 className="text-2xl font-bold">HTML 바로 공유</h1>
      <p className="mt-1 text-ink-3">파일을 올리면 즉시 공유 링크가 생성됩니다.</p>
      <div className="mt-8">
        <UploadForm />
      </div>
    </main>
  );
}
