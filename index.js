const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
ffmpeg.setFfmpegPath("C:/ffmpeg/bin/ffmpeg.exe");

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(cors());

app.post("/convert", (req, res) => {
  try {
    const { url } = req.body;
    const video = fs.readFileSync(url);
    const newFileName = generateUniqueId();
    //write file to temp folder
    fs.writeFileSync("temp.mpeg", video);
    //convert file to mp4
    ffmpeg("temp.mpeg")
      .output(`public/${newFileName}.mp4`)
      .on("end", function () {
        console.log("conversion ended");
        //send converted file
        res.sendFile(__dirname + `/public/${newFileName}.mp4`);
        //if file is sent, delete temp files
        fs.unlinkSync("temp.mpeg");
      })
      .on("error", function (err) {
        console.log("error: ", err);
      })
      .run();
  } catch (e) {
    //log error line
    console.log(e);
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});


function generateUniqueId() {
    let chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let result = "";
    for (let i = 32; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)];
    return result;
}