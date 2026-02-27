// main.js
const { app, BrowserWindow, ipcMain, dialog } = require("electron"); // <-- Agregamos 'dialog'
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");

// --- Configuración de la Base de Datos ---
// Definimos la ruta de la base de datos en la carpeta de datos del usuario
const dbPath = path.join(app.getPath("userData"), "datos_academicos.sqlite");
const db = new sqlite3.Database(dbPath);

// Función global para la ventana principal
let mainWindow;

/**
 * Función para ejecutar la creación de todas las tablas
 * "IF NOT EXISTS" asegura que solo se creen la primera vez.
 */
function setupDatabase() {
  db.serialize(() => {
    // 1. Tabla Usuarios
    db.run(`CREATE TABLE IF NOT EXISTS Usuarios (
      id_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    )`);

    // 2. Tabla Alumnos
    db.run(`CREATE TABLE IF NOT EXISTS Alumnos (
      id_alumno INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_control TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      apellido_paterno TEXT NOT NULL,
      apellido_materno TEXT,
      genero TEXT,
      fecha_nacimiento TEXT,
      status TEXT,
      id_periodo_ingreso_fk INTEGER,
      FOREIGN KEY (id_periodo_ingreso_fk) REFERENCES PeriodosEscolares(id_periodo)
    )`);

    // 3. Tabla PeriodosEscolares
    db.run(`CREATE TABLE IF NOT EXISTS PeriodosEscolares (
      id_periodo INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT UNIQUE NOT NULL
    )`);

    // 3.5. NUEVA Tabla Grupos (Amarrada a Periodos)
    db.run(`CREATE TABLE IF NOT EXISTS Grupos (
      id_grupo INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_grupo TEXT NOT NULL,
      id_periodo_fk INTEGER NOT NULL,
      FOREIGN KEY (id_periodo_fk) REFERENCES PeriodosEscolares(id_periodo)
    )`);

    // 4. Tabla Materias (ACTUALIZADA CON CRÉDITOS)
    db.run(`CREATE TABLE IF NOT EXISTS Materias (
      id_materia INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_materia TEXT NOT NULL,
      semestre_ideal INTEGER,
      creditos INTEGER DEFAULT 0 -- ¡NUEVO CAMPO PARA GRÁFICAS PONDERADAS!
    )`);

    // 5. Tabla Titulados (VERSIÓN 3 - FINAL)
    db.run(`CREATE TABLE IF NOT EXISTS Titulados (
      id_titulacion INTEGER PRIMARY KEY AUTOINCREMENT,
      id_alumno_fk INTEGER NOT NULL,
      fecha_titulacion TEXT NOT NULL,
      modalidad TEXT NOT NULL,
      folio_acta TEXT,
      promedio REAL,             -- Nuevo campo
      mencion_honorifica INTEGER, -- Nuevo campo (0 o 1)
      FOREIGN KEY (id_alumno_fk) REFERENCES Alumnos(id_alumno)
    )`);

    // 6. Tabla Inscripciones (ACTUALIZADA: Cambio de 'grupo TEXT' a 'id_grupo_fk INTEGER')
    db.run(`CREATE TABLE IF NOT EXISTS Inscripciones (
      id_inscripcion INTEGER PRIMARY KEY AUTOINCREMENT,
      id_alumno_fk INTEGER NOT NULL,
      id_materia_fk INTEGER NOT NULL,
      id_periodo_fk INTEGER NOT NULL,
      id_grupo_fk INTEGER NOT NULL, -- ¡NUEVO CAMPO RELACIONAL OFICIAL!
      calificacion REAL, 
      estado_materia TEXT DEFAULT 'Cursando', 
      FOREIGN KEY (id_alumno_fk) REFERENCES Alumnos(id_alumno),
      FOREIGN KEY (id_materia_fk) REFERENCES Materias(id_materia),
      FOREIGN KEY (id_periodo_fk) REFERENCES PeriodosEscolares(id_periodo),
      FOREIGN KEY (id_grupo_fk) REFERENCES Grupos(id_grupo)
    )`);

    console.log("Base de datos y tablas aseguradas.");
  });
}

/**
 * Crea la ventana principal de la APLICACIÓN (el dashboard)
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, // Ventana grande
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile("index.html"); // Carga la app principal
  // ¡AGREGA ESTA LÍNEA PARA ABRIR LA CONSOLA AUTOMÁTICAMENTE!
  //mainWindow.webContents.openDevTools();
  mainWindow.setMenu(null); // Quita el menú
}

/**
 * Crea la ventana de autenticación (Login o Setup)
 */
function createAuthWindow(file, width, height) {
  const authWindow = new BrowserWindow({
    width: width,
    height: height,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"), // ¡Importante!
    },
    resizable: false,
    maximizable: false,
  });

  authWindow.loadFile(file);
  authWindow.setMenu(null);

  // Devuelve la ventana para que podamos cerrarla después
  return authWindow;
}

// --- Lógica de Arranque de la App ---
app.whenReady().then(() => {
  // 1. Aseguramos que la BD y las tablas existan
  setupDatabase();

  // 2. Revisamos si hay usuarios
  db.get("SELECT COUNT(*) as count FROM Usuarios", (err, row) => {
    if (err) {
      console.error(err.message);
      return;
    }

    // 3. Decidimos qué pantalla mostrar
    if (row.count === 0) {
      // No hay usuarios, mostrar pantalla de configuración
      createAuthWindow("setup.html", 500, 650);
    } else {
      // Hay usuarios, mostrar pantalla de login
      createAuthWindow("login.html", 500, 550);
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // Esto es para macOS, pero es buena práctica tenerlo
      // Deberíamos re-ejecutar la lógica de chequeo de usuario
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// --- Lógica de IPC (Comunicación) ---

// Escucha el evento 'setup-create-admin' desde setup.html
ipcMain.on("setup-create-admin", async (event, data) => {
  const { username, password } = data;

  // Encriptamos la contraseña
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  // Insertamos en la BD
  const sql = `INSERT INTO Usuarios (username, password_hash) VALUES (?, ?)`;
  db.run(sql, [username, passwordHash], function (err) {
    if (err) {
      // Si falla (ej: usuario ya existe), enviamos error
      event.reply(
        "setup-error",
        "Error al crear usuario. Intenta con otro nombre.",
      );
    } else {
      // Si tiene éxito
      console.log(`Usuario admin creado con ID: ${this.lastID}`);
      // Cerramos la ventana de setup
      BrowserWindow.fromWebContents(event.sender).close();
      // Abrimos la aplicación principal
      createMainWindow();
    }
  });
});

// Escucha el evento 'login-attempt' desde login.html
ipcMain.on("login-attempt", (event, data) => {
  const { username, password } = data;

  const sql = `SELECT * FROM Usuarios WHERE username = ?`;
  db.get(sql, [username], async (err, user) => {
    if (err) {
      event.reply("login-response", {
        success: false,
        message: "Error en la base de datos.",
      });
      return;
    }

    // 1. Si no se encuentra el usuario
    if (!user) {
      event.reply("login-response", {
        success: false,
        message: "Usuario o contraseña incorrectos.",
      });
      return;
    }

    // 2. Comparamos la contraseña
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (validPassword) {
      // ¡Éxito!
      event.reply("login-response", { success: true });
      // Cerramos la ventana de login
      BrowserWindow.fromWebContents(event.sender).close();
      // Abrimos la aplicación principal
      createMainWindow();
    } else {
      // Contraseña incorrecta
      event.reply("login-response", {
        success: false,
        message: "Usuario o contraseña incorrectos.",
      });
    }
  });
});

// --- MANEJADORES DE DATOS (API INTERNA) ---

/**
 * Escucha la petición 'get-alumnos' desde el frontend
 * y devuelve la lista de alumnos.
 */
ipcMain.handle("get-alumnos", async (event) => {
  return new Promise((resolve, reject) => {
    // Consulta SQL que une Alumnos con Periodos para obtener el nombre del periodo
    const sql = `
      SELECT a.*, p.nombre as periodo_ingreso_nombre 
      FROM Alumnos a
      LEFT JOIN PeriodosEscolares p ON a.id_periodo_ingreso_fk = p.id_periodo
      ORDER BY a.apellido_paterno, a.apellido_materno, a.nombre
    `;

    db.all(sql, [], (err, rows) => {
      if (err) {
        console.error("Error al obtener alumnos:", err.message);
        reject(err); // Devuelve un error
      } else {
        // Devuelve la lista de alumnos
        resolve(rows);
      }
    });
  });
});

/**
 * Escucha la petición 'get-periodos' y devuelve la lista de periodos.
 */
ipcMain.handle("get-periodos", async (event) => {
  return new Promise((resolve, reject) => {
    const sql = "SELECT * FROM PeriodosEscolares ORDER BY nombre DESC";
    db.all(sql, [], (err, rows) => {
      if (err) {
        console.error("Error al obtener periodos:", err.message);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
});

/**
 * Escucha la petición 'add-alumno' para crear un nuevo estudiante.
 */
ipcMain.handle("add-alumno", async (event, alumnoData) => {
  return new Promise((resolve, reject) => {
    const {
      numero_control,
      nombre,
      apellido_paterno,
      apellido_materno,
      genero,
      fecha_nacimiento,
      status,
      id_periodo_ingreso_fk,
    } = alumnoData;

    const sql = `INSERT INTO Alumnos 
      (numero_control, nombre, apellido_paterno, apellido_materno, genero, fecha_nacimiento, status, id_periodo_ingreso_fk) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
      numero_control,
      nombre,
      apellido_paterno,
      apellido_materno,
      genero,
      fecha_nacimiento,
      status,
      id_periodo_ingreso_fk,
    ];

    db.run(sql, params, function (err) {
      if (err) {
        // Manejamos el error común de 'UNIQUE constraint failed'
        if (
          err.message.includes(
            "UNIQUE constraint failed: Alumnos.numero_control",
          )
        ) {
          console.error("Error: Número de control ya existe.");
          reject(new Error("El número de control ya existe."));
        } else {
          console.error("Error al agregar alumno:", err.message);
          reject(err);
        }
      } else {
        // Si tiene éxito, devolvemos el ID del nuevo alumno
        console.log(`Nuevo alumno agregado con ID: ${this.lastID}`);
        resolve({ success: true, id: this.lastID });
      }
    });
  });
});

/**
 * Escucha la petición 'delete-alumno'
 */
ipcMain.handle("delete-alumno", async (event, id_alumno) => {
  return new Promise((resolve, reject) => {
    // Primero borramos sus inscripciones (si tiene) para mantener integridad
    db.run(
      "DELETE FROM Inscripciones WHERE id_alumno_fk = ?",
      [id_alumno],
      (err) => {
        if (err) {
          console.error("Error al borrar inscripciones del alumno:", err);
          // No detenemos el proceso, intentamos borrar el alumno
        }

        // Ahora borramos al alumno
        db.run(
          "DELETE FROM Alumnos WHERE id_alumno = ?",
          [id_alumno],
          function (err) {
            if (err) {
              console.error("Error al eliminar alumno:", err.message);
              reject(err);
            } else {
              console.log(`Alumno ${id_alumno} eliminado.`);
              resolve({ success: true });
            }
          },
        );
      },
    );
  });
});

/**
 * Obtiene un solo alumno por su ID
 */
ipcMain.handle("get-alumno-by-id", async (event, id) => {
  return new Promise((resolve, reject) => {
    const sql = "SELECT * FROM Alumnos WHERE id_alumno = ?";
    db.get(sql, [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
});

/**
 * Actualiza los datos de un alumno existente
 */
ipcMain.handle("update-alumno", async (event, data) => {
  return new Promise((resolve, reject) => {
    const {
      id_alumno,
      numero_control,
      nombre,
      apellido_paterno,
      apellido_materno,
      genero,
      fecha_nacimiento,
      status,
      id_periodo_ingreso_fk,
    } = data;

    const sql = `UPDATE Alumnos SET 
      numero_control = ?, 
      nombre = ?, 
      apellido_paterno = ?, 
      apellido_materno = ?, 
      genero = ?, 
      fecha_nacimiento = ?, 
      status = ?, 
      id_periodo_ingreso_fk = ?
      WHERE id_alumno = ?`;

    const params = [
      numero_control,
      nombre,
      apellido_paterno,
      apellido_materno,
      genero,
      fecha_nacimiento,
      status,
      id_periodo_ingreso_fk,
      id_alumno,
    ];

    db.run(sql, params, function (err) {
      if (err) {
        console.error("Error al actualizar alumno:", err.message);
        reject(err);
      } else {
        console.log(`Alumno ${id_alumno} actualizado.`);
        resolve({ success: true });
      }
    });
  });
});

/**
 * Agrega un nuevo Periodo Escolar
 */
ipcMain.handle("add-periodo", async (event, nombre) => {
  return new Promise((resolve, reject) => {
    const sql = "INSERT INTO PeriodosEscolares (nombre) VALUES (?)";
    db.run(sql, [nombre], function (err) {
      if (err) {
        // Error común: Nombre duplicado (ya existe el periodo)
        if (err.message.includes("UNIQUE constraint failed")) {
          reject(new Error("El periodo ya existe."));
        } else {
          reject(err);
        }
      } else {
        resolve({ success: true, id: this.lastID });
      }
    });
  });
});

/**
 * Elimina un Periodo Escolar
 */
ipcMain.handle("delete-periodo", async (event, id) => {
  return new Promise((resolve, reject) => {
    // IMPORTANTE: Primero verificamos si hay alumnos usándolo
    const checkSql =
      "SELECT COUNT(*) as count FROM Alumnos WHERE id_periodo_ingreso_fk = ?";

    db.get(checkSql, [id], (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      if (row.count > 0) {
        // Bloqueamos el borrado si hay alumnos asignados
        reject(
          new Error(
            `No se puede eliminar: Hay ${row.count} alumnos registrados en este periodo.`,
          ),
        );
      } else {
        // Si está libre, lo borramos
        db.run(
          "DELETE FROM PeriodosEscolares WHERE id_periodo = ?",
          [id],
          function (err) {
            if (err) reject(err);
            else resolve({ success: true });
          },
        );
      }
    });
  });
});

// ==========================================
//    MÓDULO DE GRUPOS (NUEVO)
// ==========================================

ipcMain.handle("add-grupo", async (event, data) => {
  return new Promise((resolve, reject) => {
    const { nombre_grupo, id_periodo } = data;
    const sql =
      "INSERT INTO Grupos (nombre_grupo, id_periodo_fk) VALUES (?, ?)";
    db.run(sql, [nombre_grupo, id_periodo], function (err) {
      if (err) reject(err);
      else resolve({ success: true, id: this.lastID });
    });
  });
});

ipcMain.handle("update-grupo", async (event, data) => {
  return new Promise((resolve, reject) => {
    const { id_grupo, nombre_grupo } = data;
    const sql = "UPDATE Grupos SET nombre_grupo = ? WHERE id_grupo = ?";
    db.run(sql, [nombre_grupo, id_grupo], function (err) {
      if (err) reject(err);
      else resolve({ success: true });
    });
  });
});

ipcMain.handle("get-grupos-por-periodo", async (event, id_periodo) => {
  return new Promise((resolve, reject) => {
    // Solo trae los grupos que pertenecen al periodo seleccionado
    const sql =
      "SELECT * FROM Grupos WHERE id_periodo_fk = ? ORDER BY nombre_grupo ASC";
    db.all(sql, [id_periodo], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
});

ipcMain.handle("delete-grupo", async (event, id_grupo) => {
  return new Promise((resolve, reject) => {
    const sql = "DELETE FROM Grupos WHERE id_grupo = ?";
    db.run(sql, [id_grupo], function (err) {
      if (err) reject(err);
      else resolve({ success: true });
    });
  });
});

/**
 * Muestra un diálogo nativo del sistema (Windows/Mac)
 * Retorna true si el usuario dice "Sí", false si dice "No/Cancelar"
 */
ipcMain.handle("dialog-confirm", async (event, pregunta) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: "question",
    buttons: ["Cancelar", "Sí, Eliminar"], // El botón 0 es Cancelar, el 1 es Sí
    defaultId: 0, // La opción por defecto es Cancelar (seguridad)
    title: "Confirmación requerida",
    message: pregunta,
    noLink: true,
    normalizeAccessKeys: true,
  });

  // Si la respuesta es 1 (el segundo botón), devolvemos true
  return result.response === 1;
});

/**
 * Muestra una alerta nativa (solo para aceptar)
 */
ipcMain.handle("dialog-alert", async (event, mensaje) => {
  await dialog.showMessageBox(mainWindow, {
    type: "info",
    buttons: ["Entendido"],
    title: "Información",
    message: mensaje,
  });
});

/**
 * Obtiene todas las materias ordenadas por semestre
 */
ipcMain.handle("get-materias", async (event) => {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM Materias ORDER BY semestre_ideal, nombre_materia",
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      },
    );
  });
});

/**
 * Agrega una nueva materia (ACTUALIZADO CON CRÉDITOS)
 */
ipcMain.handle("add-materia", async (event, data) => {
  return new Promise((resolve, reject) => {
    const { nombre, semestre, creditos } = data; // Extraemos créditos
    const sql =
      "INSERT INTO Materias (nombre_materia, semestre_ideal, creditos) VALUES (?, ?, ?)";
    db.run(sql, [nombre, semestre, creditos], function (err) {
      if (err) reject(err);
      else resolve({ success: true, id: this.lastID });
    });
  });
});

/**
 * Elimina una materia
 */
ipcMain.handle("delete-materia", async (event, id) => {
  return new Promise((resolve, reject) => {
    // Verificamos si hay calificaciones asociadas a esta materia
    const checkSql =
      "SELECT COUNT(*) as count FROM Inscripciones WHERE id_materia_fk = ?";

    db.get(checkSql, [id], (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      if (row.count > 0) {
        reject(
          new Error(
            `No se puede eliminar: Hay ${row.count} calificaciones registradas en esta materia.`,
          ),
        );
      } else {
        db.run(
          "DELETE FROM Materias WHERE id_materia = ?",
          [id],
          function (err) {
            if (err) reject(err);
            else resolve({ success: true });
          },
        );
      }
    });
  });
});

// ==========================================
//    MÓDULO ACADÉMICO (Inscripciones)
// ==========================================

/**
 * Obtiene el Kardex (historial) de un alumno específico
 */
ipcMain.handle("get-kardex", async (event, id_alumno) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        i.id_inscripcion, 
        i.calificacion,
        m.nombre_materia,
        m.semestre_ideal,
        p.nombre as nombre_periodo
      FROM Inscripciones i
      JOIN Materias m ON i.id_materia_fk = m.id_materia
      JOIN PeriodosEscolares p ON i.id_periodo_fk = p.id_periodo
      WHERE i.id_alumno_fk = ?
      ORDER BY p.nombre DESC, m.nombre_materia ASC
    `;
    db.all(sql, [id_alumno], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
});

/**
 * Registra una calificación (Inscribe alumno a materia)
 */
ipcMain.handle("add-calificacion", async (event, data) => {
  return new Promise((resolve, reject) => {
    const { id_alumno, id_materia, id_periodo, calificacion } = data;

    // Validamos que no esté ya inscrito en esa materia en ese mismo periodo
    const checkSql =
      "SELECT id_inscripcion FROM Inscripciones WHERE id_alumno_fk=? AND id_materia_fk=? AND id_periodo_fk=?";

    db.get(checkSql, [id_alumno, id_materia, id_periodo], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      if (row) {
        reject(
          new Error(
            "El alumno ya tiene calificación en esta materia para este periodo.",
          ),
        );
        return;
      }

      // Si no existe, insertamos
      const sql = `INSERT INTO Inscripciones (id_alumno_fk, id_materia_fk, id_periodo_fk, calificacion) VALUES (?, ?, ?, ?)`;
      db.run(
        sql,
        [id_alumno, id_materia, id_periodo, calificacion],
        function (err) {
          if (err) reject(err);
          else resolve({ success: true });
        },
      );
    });
  });
});

/**
 * Elimina una calificación del historial
 */
ipcMain.handle("delete-calificacion", async (event, id_inscripcion) => {
  return new Promise((resolve, reject) => {
    db.run(
      "DELETE FROM Inscripciones WHERE id_inscripcion = ?",
      [id_inscripcion],
      function (err) {
        if (err) reject(err);
        else resolve({ success: true });
      },
    );
  });
});

/**
 * Actualiza una materia existente (ACTUALIZADO CON CRÉDITOS)
 */
ipcMain.handle("update-materia", async (event, data) => {
  return new Promise((resolve, reject) => {
    const { id, nombre, semestre, creditos } = data; // Extraemos créditos
    const sql =
      "UPDATE Materias SET nombre_materia = ?, semestre_ideal = ?, creditos = ? WHERE id_materia = ?";
    db.run(sql, [nombre, semestre, creditos, id], function (err) {
      if (err) reject(err);
      else resolve({ success: true });
    });
  });
});

/**
 * NUEVO: Guarda múltiples calificaciones de golpe (Sábana Inteligente)
 * Recibe un array de objetos con las calificaciones de todo un grupo
 */
/**
 * Guarda múltiples calificaciones (ACTUALIZADO PARA id_grupo_fk)
 */
ipcMain.handle("save-calificaciones-masivas", async (event, arrayDatos) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      const sql = `
        INSERT INTO Inscripciones (id_alumno_fk, id_materia_fk, id_periodo_fk, id_grupo_fk, calificacion, estado_materia) 
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      const stmt = db.prepare(sql);

      let errores = 0;

      arrayDatos.forEach((dato) => {
        let estado = "Cursando";
        if (dato.calificacion !== null && dato.calificacion !== "") {
          estado =
            parseFloat(dato.calificacion) >= 70 ? "Aprobada" : "Reprobada";
        }
        if (dato.estado_forzado) {
          estado = dato.estado_forzado;
        }

        stmt.run(
          [
            dato.id_alumno,
            dato.id_materia,
            dato.id_periodo,
            dato.id_grupo_fk,
            dato.calificacion,
            estado,
          ],
          (err) => {
            if (err) errores++;
          },
        );
      });

      stmt.finalize((err) => {
        if (err || errores > 0) {
          db.run("ROLLBACK");
          reject(new Error("Error al guardar la lista. Verifica los datos."));
        } else {
          db.run("COMMIT");
          resolve({ success: true });
        }
      });
    });
  });
});

/**
 * Obtiene alumnos inscritos (ACTUALIZADO PARA id_grupo_fk)
 */
ipcMain.handle("get-grupo-especifico", async (event, data) => {
  return new Promise((resolve, reject) => {
    const { id_periodo, id_materia, id_grupo_fk } = data;
    const sql = `
      SELECT i.*, a.nombre, a.apellido_paterno, a.apellido_materno, a.numero_control 
      FROM Inscripciones i
      JOIN Alumnos a ON i.id_alumno_fk = a.id_alumno
      WHERE i.id_periodo_fk = ? AND i.id_materia_fk = ? AND i.id_grupo_fk = ?
      ORDER BY a.apellido_paterno, a.apellido_materno, a.nombre
    `;
    db.all(sql, [id_periodo, id_materia, id_grupo_fk], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
});

// ==========================================
//    MÓDULO DE TITULACIÓN (FINAL)
// ==========================================

ipcMain.handle("titular-alumno", async (event, data) => {
  return new Promise((resolve, reject) => {
    // Desestructuramos los nuevos datos
    const { id_alumno, fecha, modalidad, folio, promedio, mencion } = data;

    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      const sqlInsert = `
        INSERT INTO Titulados 
        (id_alumno_fk, fecha_titulacion, modalidad, folio_acta, promedio, mencion_honorifica) 
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      db.run(
        sqlInsert,
        [id_alumno, fecha, modalidad, folio, promedio, mencion],
        function (err) {
          if (err) {
            db.run("ROLLBACK");
            return reject(err);
          }

          const sqlUpdate =
            "UPDATE Alumnos SET status = 'Titulado' WHERE id_alumno = ?";
          db.run(sqlUpdate, [id_alumno], function (err2) {
            if (err2) {
              db.run("ROLLBACK");
              return reject(err2);
            }

            db.run("COMMIT");
            resolve({ success: true });
          });
        },
      );
    });
  });
});

ipcMain.handle("get-titulados", async (event) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT t.*, a.nombre, a.apellido_paterno, a.apellido_materno, a.numero_control
      FROM Titulados t
      JOIN Alumnos a ON t.id_alumno_fk = a.id_alumno
      ORDER BY t.fecha_titulacion DESC
    `;
    db.all(sql, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
});

ipcMain.handle("delete-titulacion", async (event, id_titulacion) => {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT id_alumno_fk FROM Titulados WHERE id_titulacion = ?",
      [id_titulacion],
      (err, row) => {
        if (err || !row)
          return reject(err || new Error("Registro no encontrado"));

        const id_alumno = row.id_alumno_fk;

        db.serialize(() => {
          db.run("BEGIN TRANSACTION");
          db.run(
            "DELETE FROM Titulados WHERE id_titulacion = ?",
            [id_titulacion],
            (errDel) => {
              if (errDel) {
                db.run("ROLLBACK");
                return reject(errDel);
              }
              db.run(
                "UPDATE Alumnos SET status = 'Egresado' WHERE id_alumno = ?",
                [id_alumno],
                (errUpd) => {
                  if (errUpd) {
                    db.run("ROLLBACK");
                    return reject(errUpd);
                  }
                  db.run("COMMIT");
                  resolve({ success: true });
                },
              );
            },
          );
        });
      },
    );
  });
});
