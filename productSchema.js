const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({

    price: Number,
  title: String,
  description: String,
  image: String,
  category: String
 })

const Product = mongoose.model("products", productSchema);

module.exports = Product;