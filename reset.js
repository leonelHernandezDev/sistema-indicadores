const { app } = require("electron");
const fs = require("fs");
app.setName("sistemaindicadores");
const path = require("path");

app.whenReady().then(() => {
  // Buscamos la ruta exacta donde Electron guarda tu base de datos
  const dbPath = path.join(app.getPath("userData"), "datos_academicos.sqlite");

  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath); // Eliminamos el archivo físico
    console.log("💥 ¡BASE DE DATOS ELIMINADA CON ÉXITO!");
    console.log(
      "La próxima vez que inicies el programa, estará 100% en blanco y te pedirá crear usuario.",
    );
  } else {
    console.log("No se encontró la base de datos. Ya está limpia.");
  }

  app.quit();
});
