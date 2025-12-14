<script setup>
import { useRoute } from 'vue-router'
import {computed} from 'vue';
import {blogPosts} from "../data/post.js";
import {marked} from "marked";
// 1. 获取当前路由信息
// route 对象包含了当前 URL 的所有信息（比如参数、路径、查询字符串）
const route = useRoute()

// 2. 获取 URL 里的 id 参数
// 比如访问 /post/123，route.params.id 就是 "123"
console.log('当前文章ID:', route.params.id)


//文章查找（拿到“id”后，要根据id查找对应文章
const post=computed(()=>{

  const id=Number(route.params.id)

  return blogPosts.value.find(p=>p.id===id)

})//调用函数需要用（），（这里computed就是一个函数），括号内填参数（这里是find逻辑函数）


const postHtml=computed(()=>{

  if(!post.value||!post.value.content) {//管道符号可以看作或
    return '';//返回空
  }

  return marked.parse(post.value.content);


})
</script>

<template>
  <div class="article-detail">
    <div v-if="post">
      <h1>{{ post.title }}</h1>
      <img v-if="post.image" :src="post.image" class="hero-image" />
      <div class="meta">
        <span class="date">📅 {{ post.date }}</span>
        <span class="likes">👍 {{ post.like }} 赞</span>
      </div>

      <div class="content markdown-body" v-html="postHtml"></div>
      <div>{{post.summary}}</div>
    </div>

    <div v-else class="not-found">
      😭 文章走丢了...
    </div>


    <router-link to="/" class="back-btn">⬅ 返回首页</router-link>
  </div>
</template>

<style scoped>
.article-detail {
  max-width: 800px;
  margin: 40px auto;
  padding: 20px;
  line-height: 1.8; /* 让正文阅读更舒服 */
}

h1 {
  font-size: 2.5rem;
  margin-bottom: 20px;
  color: #333;
}

.meta {
  color: #888;
  margin-bottom: 30px;
  font-size: 0.9rem;
  border-bottom: 1px solid #eee;
  padding-bottom: 20px;
}

.meta span {
  margin-right: 20px;
}

.content {
  font-size: 1.1rem;
  color: #444;
  white-space: pre-wrap; /* ✅ 关键：保留换行符，否则所有字都挤在一起 */
}

.back-btn {
  display: inline-block;
  margin-top: 50px;
  text-decoration: none;
  color: #42b883;
  font-weight: bold;
}
/*图片样式*/
.hero-image {
  width: 100%;
  max-height: 400px; /* 详情页可以稍微大一点 */
  object-fit: cover;
  border-radius: 12px;
  margin-bottom: 20px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

/*给渲染出来的 Markdown 加点样式 */
/* :deep() 是 Vue 的样式穿透，因为 v-html 生成的内容属于“子元素”，普通 scoped 样式管不到它 */
.markdown-body :deep(h1) { font-size: 2em; margin-bottom: 0.6em; }
.markdown-body :deep(h2) { font-size: 1.5em; margin-top: 0.5em; }
.markdown-body :deep(p) { margin-bottom: 0.6em; line-height: 0.2em; }
.markdown-body :deep(code) { background: #f4f4f4; padding: 2px 5px; border-radius: 4px; }
.markdown-body :deep(pre) { background: #282c34; color: black; padding: 15px; border-radius: 8px; overflow-x: auto; }
.markdown-body :deep(blockquote) { border-left: 4px solid #42b883; margin: 0; padding-left: 15px; color: #666; }
</style>