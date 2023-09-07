const express = require("express");
const cors = require("cors");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const axios = require("axios");
/* ffmpeg.setFfmpegPath("C:/ffmpeg/bin/ffmpeg.exe"); */
ffmpeg.setFfmpegPath("/usr/bin/ffmpeg");

var bodyParser = require("body-parser");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });

const app = express();
const port = 3000;

app.use(cors());

// for parsing application/json
app.use(bodyParser.json());

// for parsing application/xwww-
app.use(bodyParser.urlencoded({ extended: true }));

app.post("/convert", upload.single("file"), (req, res) => {
  try {
    let file = req.file;
    const fileName = file.originalname.split(".")[0];
    const video = fs.readFileSync(file.path);
    //write file to temp folder
    fs.writeFileSync(__dirname + "/" + fileName + ".mpeg", video);
    //convert file to mp4
    ffmpeg(__dirname + "/" + fileName + ".mpeg")
      .output(__dirname + `/public/${fileName}.mp4`)
      .on("end", function () {
        const response = sendToClientServer(fileName, req.token);
        res.send(response);
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

function sendToClientServer(fileName, token) {
  //post data to https://api.eks-kanalsanierung.de/public/api/files
  const url = "https://api.eks-kanalsanierung.de/public/api/files";
  const data = {
    name: fileName,
  };
  const config = {
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
  };
  axios
    .post(url, data, config)
    .then((response) => {
      console.log(response.data);
      return response.data;
    })
    .catch((error) => {
      console.log(error);
    });
}
