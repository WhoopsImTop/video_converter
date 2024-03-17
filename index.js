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
  //reset status.json file
  fs.writeFileSync("status.json", JSON.stringify({}));
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

function replaceSpecialChars(filename) {
  return filename
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/é/g, "e")
    .replace(/[^\w\-\.]/g, "_");
}

app.post("/upload-file", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    // Dateiname mit Sonderzeichen ersetzen
    const cleanedFilename = replaceSpecialChars(file.originalname);

    // Generiere Datei-ID
    const file_id = Math.floor(Math.random() * 1000000000);
    // Hole Dateipfad der hochgeladenen Datei
    const filePath = file.path;

    // Speichere ID, Dateiname und Erweiterung in einer Datenbankdatei
    const data = {
      id: file_id,
      filename: cleanedFilename,
      extension: cleanedFilename.split(".").pop(),
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

const statusFilePath = path.join(__dirname, "status.json");

// Initialisiere die Status-Datei, wenn sie nicht existiert
if (!fs.existsSync(statusFilePath)) {
  fs.writeFileSync(statusFilePath, JSON.stringify({}));
}

app.post("/convert-file", async (req, res) => {
  try {
    const file_id = req.body.file_id;
    const db = fs.readFileSync(path.join(__dirname, "database.json"));
    const dbData = JSON.parse(db);
    const fileData = dbData.find((data) => data.id == file_id);

    if (fileData) {
      const inputFile = fileData.filepath;
      const fileName = fileData.filename.split(".").shift();
      const fileExtension = fileData.extension;
      const outputFile = __dirname + `/output/${fileName}.mp4`;

      if (fileExtension === "mpeg" || fileExtension === "mpg") {
        // Status-Update vor der Konvertierung
        let statusData = JSON.parse(fs.readFileSync(statusFilePath));
        statusData[file_id] = { status: "processing" };
        fs.writeFileSync(statusFilePath, JSON.stringify(statusData));

        new Promise((resolve, reject) => {
          ffmpeg()
            .input(inputFile)
            .videoCodec("libx264")
            .videoBitrate("1000k")
            .audioCodec("libmp3lame")
            .audioBitrate("128k")
            .output(outputFile)
            .on("end", () => {
              const publicUrl = `https://api.eliasenglen.de/output/${fileName}.mp4`;
              statusData[file_id] = { status: "completed", fileUrl: publicUrl };
              fs.writeFileSync(statusFilePath, JSON.stringify(statusData));
              resolve();
            })
            .on("progress", function (progress) {
              console.log(
                "progress: ",
                new Date().toLocaleString("de-DE") +
                  " - " +
                  progress.percent +
                  "%"
              );
              // Status-Update während der Konvertierung
              let statusData = JSON.parse(fs.readFileSync(statusFilePath));
              statusData[file_id] = {
                status: "processing",
                progress: progress.percent,
              };
              fs.writeFileSync(statusFilePath, JSON.stringify(statusData));
            })
            .on("error", (err) => {
              statusData[file_id] = { status: "error", error: err.message };
              fs.writeFileSync(statusFilePath, JSON.stringify(statusData));
              reject(err);
            })
            .run();
        });

        res.json({ message: "Konvertierung gestartet.", file_id: file_id });
      } else {
        //move file to output folder
        fs.renameSync(inputFile, outputFile);
        //send the public url of the file
        const publicUrl = `https://api.eliasenglen.de/output/${fileName}.${fileExtension}`;
        res.json({
          message: "Datei ist bereits konvertiert.",
          fileUrl: publicUrl,
        });
      }
    } else {
      res.status(400).send("File not found");
    }
  } catch (error) {
    console.error("An error occurred:", error);
    res.status(500).send("An error occurred during processing.");
  }
});

app.get("/conversion-status/:file_id", (req, res) => {
  const file_id = req.params.file_id;
  const statusData = JSON.parse(fs.readFileSync(statusFilePath));

  if (statusData[file_id]) {
    res.json({
      status: statusData[file_id].status,
      fileUrl: statusData[file_id].fileUrl || null,
      error: statusData[file_id].error || null,
      progress: statusData[file_id].progress || null,
    });
  } else {
    res.status(404).send("Status für angegebene Datei-ID nicht gefunden.");
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
