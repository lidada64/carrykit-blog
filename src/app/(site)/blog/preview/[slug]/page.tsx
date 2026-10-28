import { notFound } from "next/navigation";
import { previewArticles } from "@/lib/blog-preview";

export default async function PreviewArticle({ params }: { params: Promise<{ slug: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { slug } = await params;
  const article = previewArticles.find(item => item.slug === slug);
  if (!article) notFound();
  return <article className="mx-auto max-w-3xl px-6 py-24"><h1 className="font-display text-heading">{article.title}</h1><p className="py-6 font-mono text-caption text-muted">{article.date}</p><div className="space-y-6 text-body">{article.content.split("\n\n").map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></article>;
}
