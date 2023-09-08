const express = require("express");
const cors = require("cors");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const request = require("request");
/* ffmpeg.setFfmpegPath("C:/ffmpeg/bin/ffmpeg.exe"); */
ffmpeg.setFfmpegPath("/usr/bin/ffmpeg");
const axios = require("axios");
require("dotenv").config();

var bodyParser = require("body-parser");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });

const app = express();
const port = 3000;

app.use(cors());

// for parsing application/json
app.use(bodyParser.json());

let lastRequestTime = null;

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

    if (minutesSinceLastRequest >= 1) {
      // Hier kannst du den PUT-Request ausführen, z.B. mit axios
      const config = {
        url: `https://scp-api.strato.de/v1/servers/${process.env.STRATO_SERVER_ID}/status`,
        method: "put",
        headers: {
          "X-TOKEN": process.env.STRATO_API_TOKEN,
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

app.use(bodyParser.urlencoded({ extended: true }));

app.post("/convert", upload.single("file"), (req, res) => {
  try {
    let file = req.file;
    //get token from request
    const file_id = req.body.file_id;
    console.log("file_id: ", file_id);
    const fileName = file.originalname.split(".")[0];
    const video = fs.readFileSync(file.path);
    //write file to temp folder
    fs.writeFileSync(__dirname + "/" + fileName + ".mpeg", video);
    //convert file to mp4
    ffmpeg(__dirname + "/" + fileName + ".mpeg")
      .output(__dirname + `/public/${fileName}.mp4`)
      .on("end", function () {
        if (file_id) {
          sendToClientServer(fileName, file_id);
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
  } catch (e) {
    res.send({ error: e, message: "Fehler beim Hochladen und umwandeln." });
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
