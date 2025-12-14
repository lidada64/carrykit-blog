<script>


</script>



<template>
<nav class="navbar">
  <div class="logo">My blog</div>


<div class="menu">
  <router-link to="/">Home page </router-link>
  <router-link to="/About">About page</router-link>
</div>

</nav>

  <router-view v-slot="{ Component }">
    <Transition name="fade" mode="out-in">
      <component :is="Component" />
    </Transition>
  </router-view>




</template>

<style scoped>
/* 简单的导航栏样式 */
.navbar {
  /* 1. 固定在顶部，这样才能盖住滚动的文章 */
  position: sticky;
  top: 0;
  z-index: 100; /* 保证它在最上面 */

  /* 2. 把背景色改成半透明 */
  /* 这里的 0.8 是透明度，你可以根据喜好调 */
  background-color: rgba(255, 255, 255, 0.8);

  /* 3. 核心：背景模糊滤镜 */
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px); /* 兼容 Safari */

  /* 4. 加个底边框，增加层次感 */
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  border-bottom: 2px solid rgba(0, 0, 0, 0.1);
  border-left: 1px solid rgba(0, 0, 0, 0.1);
  border-right: 1px solid rgba(0, 0, 0, 0.1);
  /* ...原来的 padding 等样式保持不变... */
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  margin-bottom: 20px;
}

/* 深色模式适配 */
@media (prefers-color-scheme: dark) {
  .navbar {
    /* 深色模式下的半透明黑 */
    background-color: rgba(51, 51, 51, 0.8);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
}

.logo {
  font-weight: bold;
  font-size: 1.2rem;
}

.menu a {
  margin-left: 20px;
  text-decoration: none;
  color: #333;
  font-weight: bold;
}

.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s ease;/*监听所有属性变化*/
}

/* 离开时：往上飘一点，变透明 */

.fade-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

/* 进入时：从下面一点飘上来 */

.fade-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

/* router-link-active 是 Vue 自动加上的类，表示当前选中的链接 */
.menu a.router-link-active {
  color: #42b883;
}

/* 深色模式适配 */
@media (prefers-color-scheme: dark) {

  .menu a { color: #fff; }
}
</style>