const express = require("express");
const cors = require("cors");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const request = require("request");
/* ffmpeg.setFfmpegPath("C:/ffmpeg/bin/ffmpeg.exe"); */
ffmpeg.setFfmpegPath("/usr/bin/ffmpeg");
const axios = require("axios");
require("dotenv").config();
const path = require("path");

const multer = require("multer");
const upload = multer(
  { dest: "uploads/" },
  { limits: { fileSize: 5000000000 } }
);

const app = express();
const port = 3000;

app.use(cors());

app.use(express.json({ limit: "50gb" }));
app.use(express.urlencoded({ extended: true }, { limit: "50gb" }));

app.use("/output", express.static(path.join(__dirname, "output")));

//setup a cronjob that clears the output, uploads and public folder every day at 00:00 and resets the database.json file
const cron = require("node-cron");
cron.schedule("0 0 * * *", () => {
  console.log("running a task every day at 00:00");
  //delete all files in output folder
  fs.readdirSync(__dirname + "/output").forEach((file) => {
    fs.unlinkSync(__dirname + "/output/" + file);
  });
  //delete all files in uploads folder
  fs.readdirSync(__dirname + "/uploads").forEach((file) => {
    fs.unlinkSync(__dirname + "/uploads/" + file);
  });
  //delete all files in public folder
  fs.readdirSync(__dirname + "/public").forEach((file) => {
    fs.unlinkSync(__dirname + "/public/" + file);
  });
  //reset database.json file
  fs.writeFileSync("database.json", JSON.stringify([]));
});

app.post("/convert", upload.single("file"), (req, res) => {
  try {
    console.log("req.body: ", req.body);
    let file = req.file;
    const file_id = req.body.file_id;
    // Holen Sie sich den Dateinamen und die Erweiterung
    const fileName = path.basename(file.originalname); // Dateiname mit Erweiterung
    const fileExtension = path.extname(fileName).toLowerCase().substring(1); // Dateierweiterung ohne Punkt
    //filename without extension
    const fileNamewithoutExtension = path.basename(
      file.originalname,
      path.extname(file.originalname)
    );

    console.log("fileName: ", fileName);
    console.log("fileExtension: ", fileExtension);
    console.log("fileNamewithoutExtension: ", fileNamewithoutExtension);
    // Überprüfen Sie, ob die Dateierweiterung mpeg oder mpg ist
    if (fileExtension === "mpeg" || fileExtension === "mpg") {
      console.log("fileExtension: ", fileExtension);
      const video = fs.readFileSync(file.path);

      fs.writeFileSync(
        __dirname + "/" + fileNamewithoutExtension + "." + fileExtension,
        video
      );

      // Konvertieren Sie die Datei in mp4
      ffmpeg()
        .input(__dirname + "/" + fileNamewithoutExtension + "." + fileExtension)
        .output(__dirname + `/public/${fileNamewithoutExtension}.mp4`)
        .on("end", function () {
          if (file_id) {
            sendToClientServer(fileNamewithoutExtension, file_id);
          } else {
            console.log("file_id not found");
          }
        })
        .on("error", function (err) {
          console.log("error: ", err);
        })
        .on("progress", function (progress) {
          console.log("progress: ", progress);
        })
        .on("start", function () {
          res.send("Processing started");
        })
        .run();
    } else {
      res
        .status(400)
        .send(
          "Unsupported file format. Only .mpeg and .mpg files are allowed."
        );
    }
  } catch (error) {
    console.error("An error occurred:", error);
    res.status(500).send("An error occurred during processing.");
  }
});

app.post("/upload-file", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    //generate file id
    const file_id = Math.floor(Math.random() * 1000000000);
    //get filepath of uploaded file
    const filePath = file.path;

    //save id, filename and extension in a database file
    const data = {
      id: file_id,
      filename: file.originalname,
      extension: file.originalname.split(".").pop(),
      filepath: filePath,
    };
    const db = fs.readFileSync(path.join(__dirname, "database.json"));
    const dbData = JSON.parse(db);
    dbData.push(data);
    fs.writeFileSync("database.json", JSON.stringify(dbData));
    res.json({ file_id: file_id });
  } catch (error) {
    console.error("An error occurred:", error);
    res.status(500).send("An error occurred during processing.");
  }
});

app.post("/convert-file", async (req, res) => {
  try {
    const file_id = req.body.file_id;
    const db = fs.readFileSync(path.join(__dirname, "database.json"));
    const dbData = JSON.parse(db);
    const fileData = dbData.find((data) => data.id == file_id);
    console.log("fileData: ", fileData);
    if (fileData) {
      const inputFile = fileData.filepath;
      const fileName = fileData.filename.split(".").shift();
      const fileExtension = fileData.extension;
      const outputFile = __dirname + `/output/${fileName}.mp4`;
      console.log("inputFile: ", inputFile);
      console.log("fileName: ", fileName);
      console.log("fileExtension: ", fileExtension);
      console.log("outputFile: ", outputFile);
      if (fileExtension === "mpeg" || fileExtension === "mpg") {
        // Convert the file to MP4 using FFmpeg
        await new Promise((resolve, reject) => {
          ffmpeg()
            .input(inputFile)
            .videoCodec("libx264")
            .videoBitrate("1000k")
            .audioCodec("libmp3lame")
            .audioBitrate("128k")
            .output(outputFile)
            .on("end", resolve)
            .on("progress", function (progress) {
              console.log("progress: ", progress);
            })
            .on("error", reject)
            .run();
        });

        //create public url for the file in output folder
        const publicUrl = `https://api.eliasenglen.de/output/${fileName}.mp4`;

        // Return the download URL in the JSON response
        res.json({ fileUrl: publicUrl });
      } else {
        res
          .status(400)
          .send(
            "Unsupported file format. Only .mpeg and .mpg files are allowed."
          );
      }
    } else {
      res.status(400).send("File not found");
    }
  } catch (error) {
    console.error("An error occurred:", error);
    res.status(500).send("An error occurred during processing.");
  }
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

function sendToClientServer(fileName, file_id) {
  //post data to https://api.eks-kanalsanierung.de/public/api/files
  const url = "https://api.eks-kanalsanierung.de/public/api/files-replace";
  const options = {
    method: "POST",
    url: url,
    headers: {
      "Content-Type": "multipart/form-data",
    },
    formData: {
      id: file_id,
      file: fs.createReadStream(__dirname + `/public/${fileName}.mp4`),
    },
  };

  request(options, function (err, res, body) {
    if (err) {
      console.log("Error : ", err);
      return;
    }
    console.log(" Body : ", body);
    return body;
  });
}
