/** Development-only sample articles; never persisted or included in published queries. */
export const previewArticles = [
  { slug: "reading-1984", title: "[书] 重读一九八四：语言与记忆", titleEn: "[Book] Reading 1984: Language and Memory", date: "2026.10.28", paragraph: "重新阅读经典时，最先变化的往往不是故事，而是读者观察世界的角度。语言如何界定记忆，记录又如何帮助我们保留彼此不同的经验？" },
  { slug: "agent-notes", title: "[Agent] 给博客助手一份可靠的阅读地图", titleEn: "[Agent] A Reliable Reading Map for a Blog Assistant", date: "2026.10.21", paragraph: "让助手回答问题，第一步是找到真正相关的文章。清晰的来源、有限的上下文和可恢复的对话状态，让每一次回答都更容易核对。" },
  { slug: "design-process", title: "[Notes] 从草图到页面：记录一次缓慢的设计过程", titleEn: "[Notes] From Sketch to Screen", date: "2026.10.14", paragraph: "设计不是一次完成的决定。先把结构放在页面上，再通过真实内容、不同屏幕和连续操作观察它，留下有效的部分。" },
  { slug: "memory-and-reading", title: "[Book][Notes] 阅读、记忆与那些值得重新打开的书", titleEn: "[Book][Notes] Reading, Memory, and Books Worth Reopening", date: "2026.10.07", paragraph: "书架像一张缓慢生长的地图，每一次回到旧书，都能发现以前忽略的细节。笔记不必代替阅读，它只需要留下下一次重逢的入口。" },
  { slug: "agent-long-title", title: "[Agent] 一次关于检索、上下文与长期对话状态的较长实践记录", titleEn: "[Agent] A Longer Field Note on Retrieval, Context, and Conversation State", date: "2026.09.30", paragraph: "一个可靠的助手需要在有限预算内找到证据、理解问题，并在多轮对话中保留必要的信息。把检索、状态和回答分开观察，才能知道改进真正发生在哪里。" },
].map((article, index) => ({ ...article, content: Array.from({ length: [3, 35, 5, 45, 120][index] }, () => article.paragraph).join("\n\n") }));
