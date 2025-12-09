import{createRouter, createWebHistory} from 'vue-router'


import Home from '/src/views/Home.vue'
import About from '/src/views/About.vue'
import Postdetail from "../views/Postdetail.vue";

const routes = [
    {
        path:'/',
        name:'Home',
        component:Home
    },
    {
        path:'/about',
        name:'About',
        component:About
    },
    {
        path:'/post/:id',
        name:'Postdetail',
        component: Postdetail
    }
]

const router=createRouter({/*创建路由实例*/
    history:createWebHistory(),
    routes
})


export default router;