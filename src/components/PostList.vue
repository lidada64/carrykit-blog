<script setup>
// 1. 定义 props (接收父组件传来的数据)
// 这里的 'posts' 就像一个快递盒，父组件会把文章数据装在里面发给我们
defineProps({
  posts: Array // 我们预期接收一个数组
})
</script>

<template>
  <div class="post-list">
    <TransitionGroup name="list" tag="div">

      <article v-for="post in posts" :key="post.id" class="post-card">



      <h3 :class="{'hot-title':post.like>10}">{{ post.title }}</h3><!--{CSS属性名：变量或逻辑}-->
        <img v-if="post.image" :src="post.image" class="post-thumb" />
      <div class="meta">
        <span class="date">{{ post.date }}</span>
        <span class="tag" v-for="tag in post.tags" :key="tag">#{{ tag }}</span>
      </div>

      <p class="summary">{{ post.summary }}</p>

      <button class="like-btn" @click="post.like++">♥ {{post.like}} </button>

      <router-link
          :to="{ name: 'Postdetail', params: { id: post.id } }"
          class="read-more-btn"
      >
        阅读全文
      </router-link>

    </article>

    </TransitionGroup>

  </div>
</template>

<style scoped>

.post-thumb {
  width: 100%;       /* 宽度填满卡片 */
  height: 200px;     /* 高度固定，整齐一点 */
  object-fit: cover; /* 裁剪模式：保持比例，多余的切掉（像朋友圈那样） */
  border-radius: 8px;
  margin: 10px 0;
}

.post-list {
  max-width: 700px;
  margin: 40px auto; /* 居中 */
  padding: 0 20px;
}

.post-card {
  background: white;
  border: 1px solid #eee;
  padding: 20px;
  margin-bottom: 20px; /* 文章之间的间距 */
  border-radius: 8px;
  transition: transform 0.3s; /* 添加一个小动画 */
  box-shadow: 0 1px 3px #696969;
}

.post-card:hover {
  transform: translateY(-5px) translateX(5px); /* 鼠标放上去会上浮一点点 */
  box-shadow: 0 2px 7px rgba(69,69,69,0.9);
}

h3 {
  margin-top: 0;
  color: #333;
}

.meta {
  color: #888;
  font-size: 0.9em;
  margin-bottom: 10px;
}

.tag {
  margin-left: 10px;
  color: #42b883;
}

.summary {
  line-height: 1.6;
  color: #555;
}


   /* 给点赞按钮加点样式，让它显眼一点 */
 .interaction-area {
   margin: 10px 0;
 }

.like-btn {
  background-color: #fff;
  border: 1px solid #ddd;
  padding: 5px 15px;
  border-radius: 20px;
  cursor: pointer;
  color: #555;
  transition: all 0.2s;
}

.like-btn:hover {
  background-color: #ffebeb; /* 悬停时变淡红色 */
  border-color: #ff4d4f;
  color: #ff4d4f;
  transform: scale(1.05); /* 稍微放大一点 */
}

.like-btn:active {
  transform: scale(0.95); /* 点击时按下去的效果 */
}

.hot-title {
  color: #ff4d4f;
  font-weight: bold;
  text-decoration: underline; /* 加个下划线 */
}
/* 深色模式适配 */
@media (prefers-color-scheme: dark) {
  .post-card {
    background: #1a1a1a;
    border-color: #333;
  }
  h3 { color: #fff; }
  .summary { color: #bbb; }
}



.read-more-btn {
  display: inline-block; /* 让链接有宽高 */
  padding: 5px 15px;
  background-color: #1b8761;
  color: white;
  text-decoration: none;
  border-radius: 4px;
  font-size: 0.9rem;
  margin-top: 10px;
  margin-left: 15px;
}
.read-more-btn:hover {
  background-color: #ffffff;
  border-color: #1b8761;
  border-width: 2px;
  border-style: solid;
  color: #05593c;
}

/* ✨ 列表动画魔法 ✨ */

/* 1. 元素进入(Enter)和离开(Leave)的激活状态 */
.list-enter-active,
.list-leave-active {
  transition: all 0.5s ease;
}

/* 2. 开始进入前 / 离开后 */
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-30px); /* 从左边滑进来 */
}

/* 3. 关键魔法：位置移动 (Move) */
/* 当列表项改变位置（比如新文章挤进来，旧文章往下挪）时的动画 */
.list-move {
  transition: transform 0.5s ease;
}

/* 4. 确保离开的元素脱离文档流，让其他元素能平滑地补位 */
.list-leave-active {
  position: absolute;
  width: 100%; /* 防止宽度塌陷 */
}
</style>