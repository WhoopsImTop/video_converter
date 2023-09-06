const express = require("express");
const cors = require("cors");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
/* ffmpeg.setFfmpegPath("C:/ffmpeg/bin/ffmpeg.exe"); */
ffmpeg.setFfmpegPath("/usr/bin/ffmpeg");

var bodyParser = require('body-parser');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' })

const app = express();
const port = 3000;

app.use(cors());

// for parsing application/json
app.use(bodyParser.json()); 

// for parsing application/xwww-
app.use(bodyParser.urlencoded({ extended: true })); 

app.post("/convert", upload.single('file'), (req, res) => {
  try {
    let file = req.file;
    const fileName = file.originalname;
    const video = fs.readFileSync(file.path);
    //write file to temp folder
    fs.writeFileSync(__dirname + "/" + fileName + ".mpeg", video);
    //convert file to mp4
    ffmpeg(__dirname + "/" + fileName + ".mpeg")
      .output(__dirname + `/public/${fileName}.mp4`)
      .on("end", function () {
        console.log("conversion ended");
        //send converted file
        res.sendFile(__dirname + `/public/${fileName}.mp4`);
        //if file is sent, delete temp files
        fs.unlinkSync(__dirname + "/" + fileName + ".mpeg");
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

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});