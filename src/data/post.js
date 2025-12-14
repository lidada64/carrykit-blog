import {ref,watch} from "vue";


export const defaultPosts = ref([
    {
        id: 1,
        title: '我的第一篇博客：Vue 学习之旅',
        date: '2023-10-24',
        tags: ['Vue3', '学习笔记'],
        summary: '学习 Vue 3路线图与指北...0000000000000000',
        like:0,
        content: `
# Vue 3 学习笔记

这是我学习 **Vue 3** 的第一天。我觉得它非常有意思！

## 核心概念
1. **Ref**: 定义响应式变量
2. **Computed**: 自动计算
3. **v-if / v-for**: 控制显示

- router 路由
- v-html 将字符串转化为html放入页面

## 代码示例
下面是一段简单的代码：

\`\`\`javascript
const count = ref(0);
console.log(count.value);
\`\`\`

> 引用：只要路是对的，就不怕远。
    `,
    },
    {
        id: 2,
        title: '为什么我选择前端开发？',
        date: '2023-10-25',
        tags: ['职业规划', '思考'],
        summary: '前端开发不仅是写代码，更是关于如何创造用户体验...111111111111111',
        like:0
    },
    {
        id: 3,
        title: 'CSS Flexbox 布局完全指南',
        date: '2023-10-26',
        tags: ['CSS', '布局','前端工程'],
        summary: 'Flexbox 是现代 CSS 布局的神器，本文总结了 justify-content 和 align-items 的区别...222222222222222',
        like:0
    },
    {
        id:4,
        title:'AI agent的发展趋势与机遇',
        date: '2025-10-31',
        tags:['AI','热点'],
        summary:'2025被称作AI Agent元年...3333333333333333333',
        like:0
    }
])

//初始化数组，如果localStorage不存在，返回默认文章
const initPosts=()=>{

    const storagePosts=localStorage.getItem('my-blog-posts');//get string
    if(storagePosts){
        return JSON.parse(storagePosts);//返回数组
    }
    else {
        return defaultPosts;
    }

}

export const blogPosts=ref(initPosts());


watch(
    blogPosts,
    (newPosts)=>{
        localStorage.setItem('my-blog-posts',JSON.stringify(newPosts));
    },
{deep:true}

)


