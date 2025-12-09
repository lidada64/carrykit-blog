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
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background-color: #f4f4f4;
  margin-bottom: 20px;
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
  .navbar { background-color: #333; }
  .menu a { color: #fff; }
}
</style>