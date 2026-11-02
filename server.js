const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const Category = require("./schema");
const app = express();
const Product = require("./productSchema");


app.use(express.json());
app.use(cors({
  origin: "*",
}));

mongoose
  .connect("mongodb://127.0.0.1:27017/grocify")
  .then(() => {
    console.log("MongoDB connected successfully");
  })
  .catch((error) => {
    console.log("MongoDB connection error:", error);
  });


app.get("/categories", async (req, res) => {
    const categories = await Category.find();
    res.json(categories);
  
});

 
app.post("/add-product", async (req, res) => {
    const { title, description, image, price, category } = req.body;
    const product = new Product({ title, description, image, price, category });
    await product.save();
    res.json({ message: "Product added successfully" });
});


app.get("/category-product", async (req, res) => {
    const cat_id = req.query.categorey_id;
    const products = await Product.find({_id: cat_id });
    res.json(products);
});








app.listen(3000, () => {
  console.log("Server running on port 3000");
});