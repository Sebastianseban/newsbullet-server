import mongoose from "mongoose";

const newsSchema = new mongoose.Schema({
  heading: { type: String, required: true },
  body: { type: String, required: true }, 
  slug: { type: String, unique: true }, 
  
},{timestamps:true});


export const News = mongoose.model("News",newsSchema)

