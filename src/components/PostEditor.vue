<script setup>

import {ref} from "vue";

const emit=defineEmits(["create-post"]);


const newTitle=ref("");
const newContent=ref("");
const imageBase64 = ref('');


const handleFileChange=(e)=>{
  const file=e.target.files[0];// 拿到用户选的第一个文件

  if(!file){
    return;
  }


  if(file.size>1024*1024){
alert('文件太大（<1MB)');
return;

}

//reader类似一个"榨汁机",可以让file里的图片转化为url格式
  const reader = new FileReader();

  reader.readAsDataURL(file);


  reader.onload=(e)=>{
    imageBase64.value=e.target.result;
  }
}


const addNew=()=> {

  if (newTitle.value.trim() === ''||!newContent.value) { /*如果是空格或没标题*/
    alert("请输入文本!")
    return
  }

  const newPost=
    {

        title: newTitle.value,
        tags: ['新帖'],
        summary: newContent.value,
        like:0,
        image:imageBase64.value
      };


    emit("create-post",newPost);//这里的第二个参数是”打包盒“


  /*清空输入框*/
  newTitle.value = "";
  newContent.value="";
  imageBase64.value = "";


}

</script>

<template>
  <div class="create-post-box">
    <h3>发布新博客</h3>
    <input
        v-model.trim="newTitle"
        type="text"
        placeholder="请输入标题"
        class="input-title"
    />

    <textarea
        v-model.trim="newContent"
        placeholder="请输入内容"
        class="input-content"
    ></textarea>

    <div class="upload-box">
      <label>📸 上传封面图：</label>
      <input type="file" @change="handleFileChange" accept="image/*" />

      <div v-if="imageBase64" class="preview">
        <p>预览：</p>
        <img :src="imageBase64" alt="Preview" />
        <button @click="imageBase64 = ''" class="clear-btn">❌ 清除图片</button>
      </div>
    </div>

    <button @click="addNew" class="publish-btn">发布</button>

  </div>
</template>

<style scoped>
.create-post-box {
  max-width: 700px;
  margin: 30px auto;
  padding: 20px;
  background: #f9f9f9; /* 浅灰背景，区分区域 */
  border-radius: 12px;
  border: 1px dashed #ccc; /* 虚线边框，更有“草稿区”的感觉 */
}

.input-title, .input-content {
  width: 100%;
  padding: 10px;
  margin-bottom: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-sizing: border-box; /* 防止 padding 撑破宽度 */
  font-family: inherit;
}

.input-content {
  height: 80px; /* 设置个默认高度 */
  resize: vertical; /* 允许用户上下拉伸 */
}

.publish-btn {
  background-color: #42b883;
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

.publish-btn:hover {
  background-color: #3aa876;
}


 .upload-box {
   margin: 15px 0;
   padding: 10px;
   background: #f9f9f9;
   border-radius: 8px;
 }

.preview img {
  max-width: 100px; /* 预览图别太大 */
  max-height: 100px;
  border-radius: 4px;
  margin-top: 10px;
  display: block;
}

.clear-btn {
  font-size: 0.8rem;
  color: red;
  background: none;
  border: none;
  cursor: pointer;
  margin-top: 5px;
}


</style>