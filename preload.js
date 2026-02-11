// preload.js
const { contextBridge, ipcRenderer } = require("electron");

// Exponemos de forma segura los métodos que nuestro HTML necesitará
contextBridge.exposeInMainWorld(
  "electronAPI", // Este será el nombre en nuestra variable "window"
  {
    // Función para enviar un mensaje a main.js
    send: (channel, data) => {
      ipcRenderer.send(channel, data);
    },
    // Función para recibir una respuesta de main.js
    receive: (channel, func) => {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    },

    // ---- ¡NUEVO! ----
    // Funciones que envían y esperan una respuesta (ej: pedir datos)
    invoke: (channel, data) => {
      return ipcRenderer.invoke(channel, data);
    },
    // Funciones para recibir un evento de main.js (ej: "datos-actualizados")
    on: (channel, func) => {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    },
  }
);
