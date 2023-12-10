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

app.use(express.json({ limit: "50gb"}));
app.use(express.urlencoded({ extended: true }, { limit: "50gb"}));

let lastRequestTime = new Date();

// Middleware, um die Zeit der letzten Anfrage in eine Datei zu schreiben
app.use((req, res, next) => {
  const currentTime = new Date();
  const formattedTime = currentTime.toISOString();

  // Schreibe die Zeit der letzten Anfrage in die Datei (z.B. lastRequestTime.txt)
  fs.writeFile("lastRequestTime.txt", formattedTime, (err) => {
    if (err) {
      console.error(
        "Fehler beim Schreiben der letzten Anfragezeit in die Datei:",
        err
      );
    } else {
      console.log(
        "Zeit der letzten Anfrage in die Datei geschrieben:",
        formattedTime
      );
    }
  });

  // Aktualisiere lastRequestTime
  lastRequestTime = currentTime;

  // Rufe die nächste Middleware oder Route auf
  next();
});

// Funktion zur Überprüfung der letzten Anfragezeit und Ausführung des PUT-Requests
function checkLastRequestTime() {
  const currentTime = new Date();
  if (lastRequestTime) {
    const timeDifference = currentTime - lastRequestTime;
    const minutesSinceLastRequest = timeDifference / (1000 * 60);

    if (minutesSinceLastRequest >= 20) {
      // Hier kannst du den PUT-Request ausführen, z.B. mit axios
      const config = {
        url: `https://scp-api.strato.de/v1/servers/${process.env.STRATO_SERVER_ID}/status/action`,
        method: "put",
        headers: {
          "X-TOKEN": process.env.STRATO_API_KEY,
          "Content-Type": "application/json",
        },
        data: {
          action: "POWER_OFF",
          method: "HARDWARE",
        },
      };
      axios
        .request(config)
        .then((response) => {
          console.log("PUT-Request erfolgreich ausgeführt:", response.data);
        })
        .catch((error) => {
          console.error("Fehler beim Ausführen des PUT-Requests:", error);
        });
    }
  }
}

// Überprüfe die letzte Anfragezeit alle Minute
setInterval(checkLastRequestTime, 60 * 1000); // 60 * 1000 Millisekunden entsprechen einer Minute

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

app.post("/convert-single", upload.single("file"), (req, res) => {
  try {
    let file = req.file;
    
    //entferne leerzeichen aus dem dateinamen und ersetze sie mit _ 
    const fileName = file.originalname.replace(/\s/g, "_");
    const fileExtension = path.extname(fileName).toLowerCase().substring(1); // Dateierweiterung ohne Punkt
    //filename without extension
    const fileNamewithoutExtension = path.basename(
      fileName,
      path.extname(file.originalname)
    );

    console.log("fileName: ", fileName);
    console.log("fileExtension: ", fileExtension);
    console.log("fileNamewithoutExtension: ", fileNamewithoutExtension);
    // Überprüfen Sie, ob die Dateierweiterung mpeg oder mpg ist
    if (fileExtension === "mpeg" || fileExtension === "mpg") {
      const video = fs.readFileSync(file.path);

      fs.writeFileSync(
        __dirname + "/" + fileNamewithoutExtension + "." + fileExtension,
        video
      );

      // Konvertieren Sie die Datei in mp4
      ffmpeg()
        .input(__dirname + "/" + fileNamewithoutExtension + "." + fileExtension)
        .output(__dirname + `/output/${fileNamewithoutExtension}.mp4`)
        .on("end", function () {
          if (file_id) {
            //return file to response
            res.sendFile(
              __dirname + `/output/${fileNamewithoutExtension}.mp4`
            );
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
