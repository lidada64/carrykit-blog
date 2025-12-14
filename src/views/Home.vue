<script setup>
import { ref ,computed,reactive} from 'vue'
import postList from '/src/components/PostList.vue'
import PostEditor from "/src/components/PostEditor.vue";
import  { blogPosts}  from '/src/data/post.js';


const name=ref("carrykit");






const bio = ref('这里是我的个人简介，正在学习 Vue 3 构建博客！')

const myNetwork=reactive({
  github: 'https://github.com/lidada64',
  gemini:'https://gemini.google.com/'
})

const publish=(data)=>{

  const newPost= {
    id: Date.now(),/*获取当前时间戳，保证id唯一*/
    date: new Date().toLocaleDateString(),
    ...data
  }

  blogPosts.value.unshift(newPost);
}

const count=ref(0)

const add=()=>{
  count.value++
}



const searchText=ref('')

const filterPosts = computed(()=>{

  if(searchText.value==='') {
    return blogPosts.value
  }

  return blogPosts.value.filter(post=> {


    return post.title.toLowerCase().includes(searchText.value.toLowerCase())
  })



})


</script>



<template>
  <div class="home-page">
  <img src="/src/assets/pixel-bucket.png" alt="666">


  <div class="profile-card">

    <h1>Hello,here's {{name}}</h1>
    <p>{{ bio }}</p>
    <p>Today is my
      <span @click="add" class="count_number">{{ count }}</span>
      day.
    </p>
<div class="about-btn">
    <router-link to="/About" class="about-btn-font">了解更多</router-link>
</div>
  </div>

  <PostEditor @create-post="publish"></PostEditor>

  <span :style="{color:'#696969',fontSize:'20px'}">Search </span><input v-model="searchText">
  <postList :posts="filterPosts"></postList>


  <div class="links">
    <a :href="myNetwork.github" target="_blank">My github</a>
    <a :href="myNetwork.gemini" target="_blank">gemini</a>
    <!--冒号用来绑定变量-->
  </div>
  </div>
</template>




<style scoped>


.about-btn{

  margin: 20px 250px;
  border-style: solid;
  border-width: 2px;
  border-color: black;
  padding: 10px;
  border-radius: 5px;
}

.about-btn-font{
  color: #05593c;
  background-color: white;
  font-weight: bold;
}

.about-btn:hover{
  background-color: lightgray;
}

.links{
  display: flex;
  justify-content: space-around;
  flex-wrap: nowrap;
  flex-direction: row;
  font-size:2em;

}
.profile-card {
  max-width: 600px;
  margin: 50px auto;
  padding: 30px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-family: Arial, sans-serif;
  text-align: center;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}



@media (prefers-color-scheme: dark) {
  .tag{
    color:rgba(256,256,256,0.87);
  }
} /*响应式交互：如果是浅色模式*/


img{
  border-radius: 50%;
}

.count_number{
  cursor: pointer;
  color: #1b8761;
  font-size: 1.5em;
  transition: transform 1s;
}

.count_number.hover{
  transform: translateY(-1px);
}


/*发布功能*/

</style>

