// main.js
const { app, BrowserWindow, ipcMain, dialog } = require("electron"); // <-- Agregamos 'dialog'
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");

// --- Configuración de la Base de Datos ---
// Definimos la ruta de la base de datos en la carpeta de datos del usuario
const dbPath = path.join(app.getPath("userData"), "datos_academicos.sqlite");
// Conectamos y ACTIVAMOS LAS LLAVES FORÁNEAS (Pilar 1)
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error al conectar a la BD:", err.message);
  } else {
    db.run("PRAGMA foreign_keys = ON", (error) => {
      if (error)
        console.error("Error activando PRAGMA foreign_keys:", error.message);
      else console.log("Seguridad de Llaves Foráneas (PRAGMA) ACTIVADA.");
    });
  }
});

// ==========================================================
// SCRIPT DE EXPANSIÓN A 10 COMPETENCIAS
// ==========================================================
db.serialize(() => {
  db.run("ALTER TABLE Inscripciones ADD COLUMN c9 REAL", (err) => {
    if (!err) console.log("Columna C9 agregada con éxito.");
  });
  db.run("ALTER TABLE Inscripciones ADD COLUMN c10 REAL", (err) => {
    if (!err) console.log("Columna C10 agregada con éxito.");
  });
});
// ==========================================================

/* ==========================================================
// SCRIPT TEMPORAL DE LIMPIEZA DE DATOS (EXORCISMO)
// ==========================================================
db.serialize(() => {
  // 1. Limpiar calificaciones finales menores a 70
  db.run(
    `UPDATE inscripciones SET calificacion_final = 0 WHERE calificacion_final < 70 AND calificacion_final > 0`,
    function (err) {
      if (!err)
        console.log(
          `[LIMPIEZA] Calificaciones finales corregidas: ${this.changes}`,
        );
    },
  );

  // 2. Limpiar competencias (C1 a C8) menores a 70
  for (let i = 1; i <= 8; i++) {
    db.run(
      `UPDATE inscripciones SET c${i} = 0 WHERE c${i} < 70 AND c${i} > 0`,
      function (err) {
        if (!err && this.changes > 0)
          console.log(
            `[LIMPIEZA] Competencia C${i} corregida: ${this.changes}`,
          );
      },
    );
  }
});*/

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

    // 2. Tabla Alumnos (Con RESTRICT en el Periodo de Ingreso)
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
      FOREIGN KEY (id_periodo_ingreso_fk) REFERENCES PeriodosEscolares(id_periodo) ON DELETE RESTRICT
    )`);

    // 3. Tabla PeriodosEscolares
    db.run(`CREATE TABLE IF NOT EXISTS PeriodosEscolares (
      id_periodo INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT UNIQUE NOT NULL
    )`);

    // 3.5. Tabla Grupos (Con RESTRICT al Periodo)
    db.run(`CREATE TABLE IF NOT EXISTS Grupos (
      id_grupo INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_grupo TEXT NOT NULL,
      id_periodo_fk INTEGER NOT NULL,
      FOREIGN KEY (id_periodo_fk) REFERENCES PeriodosEscolares(id_periodo) ON DELETE RESTRICT
    )`);

    // 4. Tabla Materias
    db.run(`CREATE TABLE IF NOT EXISTS Materias (
      id_materia INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_materia TEXT NOT NULL,
      semestre_ideal INTEGER,
      creditos INTEGER DEFAULT 0
    )`);

    // 5. Tabla Titulados (Con RESTRICT al Alumno)
    db.run(`CREATE TABLE IF NOT EXISTS Titulados (
      id_titulacion INTEGER PRIMARY KEY AUTOINCREMENT,
      id_alumno_fk INTEGER NOT NULL,
      fecha_titulacion TEXT NOT NULL,
      modalidad TEXT NOT NULL,
      folio_acta TEXT,
      promedio REAL,
      mencion_honorifica INTEGER,
      FOREIGN KEY (id_alumno_fk) REFERENCES Alumnos(id_alumno) ON DELETE RESTRICT
    )`);

    // 6. Tabla Inscripciones (¡NUEVO MODELO TECNM!)
    db.run(`CREATE TABLE IF NOT EXISTS Inscripciones (
      id_inscripcion INTEGER PRIMARY KEY AUTOINCREMENT,
      id_alumno_fk INTEGER NOT NULL,
      id_materia_fk INTEGER NOT NULL,
      id_periodo_fk INTEGER NOT NULL,
      id_grupo_fk INTEGER NOT NULL,
      
      -- Sistema de Competencias Dinámico
      c1 REAL, c2 REAL, c3 REAL, c4 REAL,
      c5 REAL, c6 REAL, c7 REAL, c8 REAL,
      calificacion_final REAL, 
      
      -- Reglas Universitarias
      estado_materia TEXT DEFAULT 'Cursando', 
      tipo_acreditacion TEXT DEFAULT 'CN', -- CN, SO, CI
      
      -- Auditoría
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      fecha_modificacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      -- Blindaje Restrictivo
      FOREIGN KEY (id_alumno_fk) REFERENCES Alumnos(id_alumno) ON DELETE RESTRICT,
      FOREIGN KEY (id_materia_fk) REFERENCES Materias(id_materia) ON DELETE RESTRICT,
      FOREIGN KEY (id_periodo_fk) REFERENCES PeriodosEscolares(id_periodo) ON DELETE RESTRICT,
      FOREIGN KEY (id_grupo_fk) REFERENCES Grupos(id_grupo) ON DELETE RESTRICT
    )`);

    console.log("Base de datos y tablas aseguradas con arquitectura TecNM.");
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
 * ¡NUEVO! Importación Masiva de Alumnos desde Excel
 */
ipcMain.handle("add-alumnos-masivo", async (event, alumnosNuevos) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      const stmt = db.prepare(`
        INSERT INTO Alumnos 
        (numero_control, nombre, apellido_paterno, apellido_materno, genero, status, id_periodo_ingreso_fk) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      let errores = 0;
      alumnosNuevos.forEach((a) => {
        // Ignoramos errores de duplicados silenciosamente en la transacción
        stmt.run(
          [
            a.numero_control,
            a.nombre,
            a.apellido_paterno,
            a.apellido_materno,
            a.genero,
            a.status,
            a.id_periodo_ingreso_fk,
          ],
          function (err) {
            if (err) errores++;
          },
        );
      });

      stmt.finalize();

      db.run("COMMIT", (err) => {
        if (err) reject(err);
        else resolve({ success: true, errores_ignorados: errores });
      });
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
    // 1. El Guardián: Verificamos si hay alumnos usando este grupo
    db.get(
      "SELECT COUNT(*) as total FROM Inscripciones WHERE id_grupo_fk = ?",
      [id_grupo],
      (err, row) => {
        if (err) return reject(err);

        if (row.total > 0) {
          // Bloqueamos la eliminación y lanzamos un error claro
          return reject(
            new Error(
              `PROTECCIÓN ACTIVADA: No se puede eliminar este grupo porque contiene ${row.total} registro(s) de calificaciones de alumnos. Debes reasignar o borrar a esos alumnos primero.`,
            ),
          );
        }

        // 2. Si el grupo está vacío (0 alumnos), permitimos borrarlo
        db.run(
          "DELETE FROM Grupos WHERE id_grupo = ?",
          [id_grupo],
          function (err) {
            if (err) reject(err);
            else resolve({ success: true });
          },
        );
      },
    );
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

// ==========================================
// GUARDIÁN DE CALIFICACIONES (Regla TecNM)
// ==========================================
function limpiarCalificacion(calif) {
  if (calif === null || calif === undefined || calif === "") return null;
  let num = parseFloat(calif);
  if (isNaN(num)) return null;

  if (num > 100) return 100; // Tope máximo
  if (num > 0 && num < 70) return 0; // Regla del NA (menor a 70 es 0)
  if (num < 0) return 0; // No existen calificaciones negativas

  return num;
}

/**
 * Guarda múltiples calificaciones (ALGORITMO UPSERT: Inserta, Actualiza o Borra)
 */
ipcMain.handle("save-calificaciones-masivas", async (event, payload) => {
  // ---> INYECCIÓN DEL GUARDIÁN <---
  payload.alumnos.forEach((a) => {
    a.c1 = limpiarCalificacion(a.c1);
    a.c2 = limpiarCalificacion(a.c2);
    a.c3 = limpiarCalificacion(a.c3);
    a.c4 = limpiarCalificacion(a.c4);
    a.c5 = limpiarCalificacion(a.c5);
    a.c6 = limpiarCalificacion(a.c6);
    a.c7 = limpiarCalificacion(a.c7);
    a.c8 = limpiarCalificacion(a.c8);
    a.c9 = limpiarCalificacion(a.c9);
    a.c10 = limpiarCalificacion(a.c10);
    a.calificacion_final = limpiarCalificacion(a.calificacion_final);
  });
  // ---------------------------------
  return new Promise((resolve, reject) => {
    // Extraemos el paquete de datos estructurado que nos enviará el frontend
    const { id_periodo, id_materia, id_grupo, alumnos } = payload;

    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      // 1. Obtenemos lo que ya existe en la BD para esta clase exacta
      const sqlExistentes =
        "SELECT id_inscripcion FROM Inscripciones WHERE id_periodo_fk=? AND id_materia_fk=? AND id_grupo_fk=?";
      db.all(sqlExistentes, [id_periodo, id_materia, id_grupo], (err, rows) => {
        if (err) {
          db.run("ROLLBACK");
          return reject(err);
        }

        // Mapeamos los IDs existentes y los que vienen de la pantalla
        const existentes = rows.map((r) => r.id_inscripcion);
        const entrantes = alumnos
          .filter((a) => a.id_inscripcion)
          .map((a) => parseInt(a.id_inscripcion));

        // 2. MAGIA DE BORRADO: Si estaba en BD pero ya no está en pantalla, lo borramos (La "X" del UI)
        const aBorrar = existentes.filter((id) => !entrantes.includes(id));
        aBorrar.forEach((id) => {
          db.run("DELETE FROM Inscripciones WHERE id_inscripcion=?", [id]);
        });

        // 3. Preparamos las sentencias de Insertar y Actualizar
        const stmtInsert = db.prepare(`
          INSERT INTO Inscripciones 
          (id_alumno_fk, id_materia_fk, id_periodo_fk, id_grupo_fk, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, calificacion_final, estado_materia, tipo_acreditacion) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const stmtUpdate = db.prepare(`
          UPDATE Inscripciones SET 
          c1=?, c2=?, c3=?, c4=?, c5=?, c6=?, c7=?, c8=?, c9=?, c10=?, calificacion_final=?, estado_materia=?, tipo_acreditacion=?, fecha_modificacion=CURRENT_TIMESTAMP
          WHERE id_inscripcion=?
        `);

        // 4. Ejecutamos según corresponda
        alumnos.forEach((a) => {
          if (a.id_inscripcion) {
            // Ya existía: ACTUALIZAR
            stmtUpdate.run([
              a.c1,
              a.c2,
              a.c3,
              a.c4,
              a.c5,
              a.c6,
              a.c7,
              a.c8,
              a.c9,
              a.c10,
              a.calificacion_final,
              a.estado_materia,
              a.tipo_acreditacion,
              a.id_inscripcion,
            ]);
          } else {
            // Es nuevo en la lista: INSERTAR
            stmtInsert.run([
              a.id_alumno_fk,
              id_materia,
              id_periodo,
              id_grupo,
              a.c1,
              a.c2,
              a.c3,
              a.c4,
              a.c5,
              a.c6,
              a.c7,
              a.c8,
              a.c9,
              a.c10, // <--- ¡ÉSTAS SON LAS QUE FALTABAN!
              a.calificacion_final,
              a.estado_materia,
              a.tipo_acreditacion,
            ]);
          }
        });

        stmtInsert.finalize();
        stmtUpdate.finalize();

        // Si todo salió bien, sellamos la transacción
        db.run("COMMIT", (err) => {
          if (err) reject(err);
          else resolve({ success: true });
        });
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

/**
 * Obtiene el historial (Kárdex) con soporte para competencias, acreditación y recurses
 */
ipcMain.handle("get-historial-alumno", async (event, id_alumno) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        i.id_inscripcion,
        i.calificacion_final,
        i.estado_materia,
        i.tipo_acreditacion,
        i.c1, i.c2, i.c3, i.c4, i.c5, i.c6, i.c7, i.c8, i.c9, i.c10,
        i.id_periodo_fk,     
        i.id_materia_fk,     
        i.id_grupo_fk,       
        m.nombre_materia,
        m.semestre_ideal,
        m.creditos,
        p.nombre AS nombre_periodo,
        g.nombre_grupo AS nombre_grupo
      FROM Inscripciones i
      JOIN Materias m ON i.id_materia_fk = m.id_materia
      JOIN PeriodosEscolares p ON i.id_periodo_fk = p.id_periodo
      JOIN Grupos g ON i.id_grupo_fk = g.id_grupo
      WHERE i.id_alumno_fk = ?
      ORDER BY p.nombre ASC -- Ordenamos cronológicamente para calcular los intentos (Recurse)
    `;
    db.all(sql, [id_alumno], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
});

/**
 * Actualiza un registro existente (Editar desde Kárdex)
 */
ipcMain.handle("update-inscripcion", async (event, data) => {
  // ---> INYECCIÓN DEL GUARDIÁN <---
  data.calificacion_final = limpiarCalificacion(data.calificacion_final);
  // ---------------------------------
  return new Promise((resolve, reject) => {
    const {
      id_inscripcion,
      id_periodo_fk,
      id_materia_fk,
      id_grupo_fk,
      calificacion_final,
      estado_materia,
      tipo_acreditacion, // <-- Recibimos acreditación
      c1,
      c2,
      c3,
      c4,
      c5,
      c6,
      c7,
      c8,
      c9,
      c10, // <-- RECIBIMOS LAS COMPETENCIAS
    } = data;

    const sql = `
      UPDATE Inscripciones 
      SET id_periodo_fk = ?, id_materia_fk = ?, id_grupo_fk = ?, calificacion_final = ?, estado_materia = ?, tipo_acreditacion = ?, c1 = ?, c2 = ?, c3 = ?, c4 = ?, c5 = ?, c6 = ?, c7 = ?, c8 = ?, c9 = ?, c10 = ?, fecha_modificacion = CURRENT_TIMESTAMP
      WHERE id_inscripcion = ?
    `;
    db.run(
      sql,
      [
        id_periodo_fk,
        id_materia_fk,
        id_grupo_fk,
        calificacion_final,
        estado_materia,
        tipo_acreditacion || "CN",
        c1,
        c2,
        c3,
        c4,
        c5,
        c6,
        c7,
        c8,
        c9,
        c10, // <-- LAS PASAMOS AL SQL
        id_inscripcion,
      ],
      function (err) {
        if (err) reject(err);
        else resolve({ success: true });
      },
    );
  });
});

/**
 * ¡NUEVO! Registra una inscripción individual (Crear desde Kárdex)
 */
ipcMain.handle("add-inscripcion-individual", async (event, data) => {
  // ---> INYECCIÓN DEL GUARDIÁN <---
  data.calificacion_final = limpiarCalificacion(data.calificacion_final);
  // ---------------------------------
  return new Promise((resolve, reject) => {
    const {
      id_alumno,
      id_materia,
      id_periodo,
      id_grupo_fk,
      calificacion_final,
      estado_materia,
      tipo_acreditacion, // <-- Recibimos si es Ordinario, Intersemestral, etc.
      c1,
      c2,
      c3,
      c4,
      c5,
      c6,
      c7,
      c8,
      c9,
      c10, // <-- RECIBIMOS LAS COMPETENCIAS
    } = data;

    // Protegemos que no lo inscriban dos veces en la misma materia/periodo
    const checkSql =
      "SELECT id_inscripcion FROM Inscripciones WHERE id_alumno_fk=? AND id_materia_fk=? AND id_periodo_fk=?";
    db.get(checkSql, [id_alumno, id_materia, id_periodo], (err, row) => {
      if (err) return reject(err);
      if (row)
        return reject(
          new Error(
            "El alumno ya tiene calificación en esta materia para este periodo.",
          ),
        );

      // Agregamos las variables a la consulta SQL
      const sql = `INSERT INTO Inscripciones (id_alumno_fk, id_materia_fk, id_periodo_fk, id_grupo_fk, calificacion_final, estado_materia, tipo_acreditacion, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      db.run(
        sql,
        [
          id_alumno,
          id_materia,
          id_periodo,
          id_grupo_fk,
          calificacion_final,
          estado_materia,
          tipo_acreditacion || "CN", // Por defecto CN por si acaso
          c1,
          c2,
          c3,
          c4,
          c5,
          c6,
          c7,
          c8,
          c9,
          c10, // <-- LAS PASAMOS AL SQL
        ],
        function (err) {
          if (err) reject(err);
          else resolve({ success: true, id: this.lastID });
        },
      );
    });
  });
});

/**
 * ¡NUEVO! Elimina un registro del historial (Borrar)
 */
ipcMain.handle("delete-inscripcion", async (event, id_inscripcion) => {
  return new Promise((resolve, reject) => {
    const sql = "DELETE FROM Inscripciones WHERE id_inscripcion = ?";
    db.run(sql, [id_inscripcion], function (err) {
      if (err) reject(err);
      else resolve({ success: true });
    });
  });
});

/**
 * ¡NUEVO! Actualiza el Status Institucional Global de un alumno desde el Kárdex (Pilar 6)
 */
ipcMain.handle("update-alumno-status", async (event, data) => {
  return new Promise((resolve, reject) => {
    const { id_alumno, status } = data;
    const sql = "UPDATE Alumnos SET status = ? WHERE id_alumno = ?";
    db.run(sql, [status, id_alumno], function (err) {
      if (err) reject(err);
      else resolve({ success: true });
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

// ==========================================
//    MÓDULO DE DASHBOARD (BUSINESS INTELLIGENCE)
// ==========================================

ipcMain.handle("get-dashboard-zona2", async (event, data) => {
  const { id_periodo, semestre } = data;

  return new Promise(async (resolve, reject) => {
    try {
      // Helpers para ejecutar consultas en promesas
      const runGet = (sql, params) =>
        new Promise((res, rej) =>
          db.get(sql, params, (err, row) => (err ? rej(err) : res(row))),
        );
      const runAll = (sql, params) =>
        new Promise((res, rej) =>
          db.all(sql, params, (err, rows) => (err ? rej(err) : res(rows))),
        );

      // Construcción dinámica de filtros
      const join =
        semestre !== "todos"
          ? "JOIN Materias m ON i.id_materia_fk = m.id_materia"
          : "";
      const where =
        semestre !== "todos"
          ? "WHERE i.id_periodo_fk = ? AND m.semestre_ideal = ?"
          : "WHERE i.id_periodo_fk = ?";
      const params =
        semestre !== "todos" ? [id_periodo, semestre] : [id_periodo];

      // 1. TARJETAS KPI Y APROBACIÓN
      const kpis = await runGet(
        `
        SELECT 
          COUNT(DISTINCT i.id_alumno_fk) as total_alumnos,
          AVG(CASE WHEN i.calificacion_final >= 70 THEN i.calificacion_final ELSE NULL END) as promedio_general,
          SUM(CASE WHEN i.estado_materia = 'Reprobada' THEN 1 ELSE 0 END) as reprobadas,
          COUNT(i.id_inscripcion) as total_materias
        FROM Inscripciones i ${join} ${where}
      `,
        params,
      );

      // 2. CAMPANA DE GAUSS (Rangos TecNM)
      const gauss = await runGet(
        `
        SELECT 
          SUM(CASE WHEN i.calificacion_final < 70 OR i.estado_materia = 'Reprobada' THEN 1 ELSE 0 END) as na,
          SUM(CASE WHEN i.calificacion_final >= 70 AND i.calificacion_final < 80 THEN 1 ELSE 0 END) as regular,
          SUM(CASE WHEN i.calificacion_final >= 80 AND i.calificacion_final < 90 THEN 1 ELSE 0 END) as bueno,
          SUM(CASE WHEN i.calificacion_final >= 90 AND i.calificacion_final <= 100 THEN 1 ELSE 0 END) as excelente
        FROM Inscripciones i ${join} ${where}
      `,
        params,
      );

      // 3. TOP 5 MATERIAS CUELLO DE BOTELLA
      const joinTop = semestre !== "todos" ? " AND m.semestre_ideal = ?" : "";
      const topMaterias = await runAll(
        `
        SELECT m.nombre_materia, COUNT(i.id_inscripcion) as reprobados
        FROM Inscripciones i
        JOIN Materias m ON i.id_materia_fk = m.id_materia
        WHERE i.id_periodo_fk = ? AND i.estado_materia = 'Reprobada' ${joinTop}
        GROUP BY m.id_materia
        ORDER BY reprobados DESC
        LIMIT 5
      `,
        params,
      );

      // 4. REGULARES VS IRREGULARES (En este periodo)
      const regIrreg = await runGet(
        `
        SELECT 
          SUM(CASE WHEN reprobadas > 0 THEN 1 ELSE 0 END) as irregulares,
          SUM(CASE WHEN reprobadas = 0 THEN 1 ELSE 0 END) as regulares
        FROM (
          SELECT i.id_alumno_fk, SUM(CASE WHEN i.estado_materia = 'Reprobada' THEN 1 ELSE 0 END) as reprobadas
          FROM Inscripciones i ${join} ${where}
          GROUP BY i.id_alumno_fk
        )
      `,
        params,
      );

      // Enviamos todo el paquete ensamblado al frontend
      resolve({ kpis, gauss, topMaterias, regIrreg });
    } catch (error) {
      reject(error);
    }
  });
});

// --- ZONA 1: VISIÓN GLOBAL E HISTÓRICA ---
ipcMain.handle("get-dashboard-zona1", async (event, filtroAnos) => {
  return new Promise(async (resolve, reject) => {
    try {
      const runGet = (sql, params = []) =>
        new Promise((res, rej) =>
          db.get(sql, params, (err, row) => (err ? rej(err) : res(row))),
        );
      const runAll = (sql, params = []) =>
        new Promise((res, rej) =>
          db.all(sql, params, (err, rows) => (err ? rej(err) : res(rows))),
        );

      const kpis = await runGet(`
        SELECT 
          (SELECT COUNT(*) FROM Alumnos WHERE status IN ('Activo', 'Baja Temporal')) as matricula_viva,
          (SELECT COUNT(*) FROM Alumnos WHERE status IN ('Egresado', 'Titulado')) as egresados,
          (SELECT AVG(calificacion_final) FROM Inscripciones WHERE calificacion_final >= 70) as promedio_historico
      `);

      let limitQuery =
        filtroAnos !== "todos" ? `LIMIT ${parseInt(filtroAnos) * 2}` : "";

      const evolucion = await runAll(`
        SELECT p.nombre as periodo, COUNT(DISTINCT i.id_alumno_fk) as total_inscritos
        FROM Inscripciones i JOIN PeriodosEscolares p ON i.id_periodo_fk = p.id_periodo
        GROUP BY p.id_periodo ORDER BY p.nombre DESC ${limitQuery}
      `);

      // NUEVO: Evolución del Promedio
      const evolucionPromedio = await runAll(`
        SELECT p.nombre as periodo, AVG(i.calificacion_final) as promedio
        FROM Inscripciones i JOIN PeriodosEscolares p ON i.id_periodo_fk = p.id_periodo
        WHERE i.calificacion_final >= 70
        GROUP BY p.id_periodo ORDER BY p.nombre DESC ${limitQuery}
      `);

      // ---> INYECCIÓN A.1: CAPTACIÓN DE NUEVOS INGRESOS <---
      const captacion = await runAll(`
        SELECT p.nombre as periodo, COUNT(a.id_alumno) as nuevos_ingresos
        FROM Alumnos a JOIN PeriodosEscolares p ON a.id_periodo_ingreso_fk = p.id_periodo
        GROUP BY p.id_periodo ORDER BY p.nombre DESC ${limitQuery}
      `);

      const demografia = await runAll(
        `SELECT genero, COUNT(*) as total FROM Alumnos GROUP BY genero`,
      );

      // NUEVO: Modalidades y Deserción
      const modalidades = await runAll(
        `SELECT modalidad, COUNT(*) as total FROM Titulados GROUP BY modalidad`,
      );
      const desercion = await runAll(`
        SELECT 
          CASE 
            WHEN status IN ('Activo', 'Baja Temporal') THEN 'Retención (Activos)'
            WHEN status IN ('Egresado', 'Titulado') THEN 'Eficiencia (Egresados)'
            ELSE 'Deserción (Bajas)'
          END as categoria, COUNT(*) as total
        FROM Alumnos GROUP BY categoria
      `);

      resolve({
        kpis,
        evolucion: evolucion.reverse(),
        evolucionPromedio: evolucionPromedio.reverse(),
        captacion: captacion.reverse(), // <-- ENVIAMOS EL DATO AL FRONTEND
        demografia,
        modalidades,
        desercion,
      });
    } catch (error) {
      reject(error);
    }
  });
});

// --- ZONA 3: ANÁLISIS MICRO (MATERIA) ---
ipcMain.handle("get-dashboard-zona3", async (event, data) => {
  const { id_periodo, id_materia, id_grupo } = data;
  return new Promise(async (resolve, reject) => {
    try {
      const runGet = (sql, params) =>
        new Promise((res, rej) =>
          db.get(sql, params, (err, row) => (err ? rej(err) : res(row))),
        );
      const runAll = (sql, params) =>
        new Promise((res, rej) =>
          db.all(sql, params, (err, rows) => (err ? rej(err) : res(rows))),
        );

      let joinGrp = id_grupo !== "todos" ? " AND i.id_grupo_fk = ?" : "";
      let params =
        id_grupo !== "todos"
          ? [id_periodo, id_materia, id_grupo]
          : [id_periodo, id_materia];

      // NUEVO: KPIs Grupales
      const kpis = await runGet(
        `
        SELECT 
          COUNT(i.id_inscripcion) as total_evaluados,
          AVG(CASE WHEN i.calificacion_final >= 70 THEN i.calificacion_final ELSE NULL END) as promedio_grupal,
          SUM(CASE WHEN i.estado_materia = 'Reprobada' OR i.calificacion_final < 70 THEN 1 ELSE 0 END) as total_reprobados
        FROM Inscripciones i WHERE i.id_periodo_fk = ? AND i.id_materia_fk = ? ${joinGrp}
      `,
        params,
      );

      const competencias = await runGet(
        `
        SELECT AVG(c1) as c1, AVG(c2) as c2, AVG(c3) as c3, AVG(c4) as c4, AVG(c5) as c5, AVG(c6) as c6, AVG(c7) as c7, AVG(c8) as c8
        FROM Inscripciones i WHERE i.id_periodo_fk = ? AND i.id_materia_fk = ? ${joinGrp}
      `,
        params,
      );

      const acreditacion = await runAll(
        `
        SELECT tipo_acreditacion, COUNT(*) as total 
        FROM Inscripciones i WHERE i.id_periodo_fk = ? AND i.id_materia_fk = ? AND calificacion_final >= 70 ${joinGrp} GROUP BY tipo_acreditacion
      `,
        params,
      );

      // NUEVO: Lista cruda para Top, Reprobados y Campana
      const alumnos = await runAll(
        `
        SELECT a.nombre, a.apellido_paterno, a.numero_control, i.calificacion_final
        FROM Inscripciones i JOIN Alumnos a ON i.id_alumno_fk = a.id_alumno
        WHERE i.id_periodo_fk = ? AND i.id_materia_fk = ? AND i.calificacion_final IS NOT NULL ${joinGrp}
        ORDER BY i.calificacion_final DESC
      `,
        params,
      );

      // NUEVO: Regularidad (Subconsulta para ver en qué intento van)
      const intentos = await runAll(
        `
        SELECT 
          (SELECT COUNT(*) FROM Inscripciones sub WHERE sub.id_alumno_fk = i.id_alumno_fk AND sub.id_materia_fk = i.id_materia_fk AND sub.id_periodo_fk <= i.id_periodo_fk) as num_intento
        FROM Inscripciones i WHERE i.id_periodo_fk = ? AND i.id_materia_fk = ? ${joinGrp}
      `,
        params,
      );

      // ---> INYECCIÓN A.4: COMPARATIVA DE TODOS LOS GRUPOS <---
      const comparativaGrupos = await runAll(
        `
        SELECT g.nombre_grupo, 
               COUNT(i.id_inscripcion) as total_alumnos, 
               SUM(CASE WHEN i.estado_materia = 'Reprobada' OR i.calificacion_final < 70 THEN 1 ELSE 0 END) as reprobados 
        FROM Inscripciones i 
        JOIN Grupos g ON i.id_grupo_fk = g.id_grupo 
        WHERE i.id_periodo_fk = ? AND i.id_materia_fk = ? 
        GROUP BY g.id_grupo
      `,
        [id_periodo, id_materia],
      );

      // ---> INYECCIÓN A.5: HISTÓRICO DE DIFICULTAD DE LA MATERIA <---
      const historicoMateria = await runAll(
        `
        SELECT p.nombre as periodo, 
               AVG(i.calificacion_final) as promedio, 
               SUM(CASE WHEN i.estado_materia = 'Reprobada' OR i.calificacion_final < 70 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(i.id_inscripcion), 0) as porcentaje_reprobacion 
        FROM Inscripciones i 
        JOIN PeriodosEscolares p ON i.id_periodo_fk = p.id_periodo 
        WHERE i.id_materia_fk = ? 
        GROUP BY p.id_periodo 
        ORDER BY p.nombre ASC
      `,
        [id_materia],
      );

      resolve({
        kpis,
        competencias,
        acreditacion,
        alumnos,
        intentos,
        comparativaGrupos,
        historicoMateria,
      });
    } catch (error) {
      reject(error);
    }
  });
});

// --- ZONA COHORTE: ANÁLISIS DE GENERACIÓN ---
ipcMain.handle("get-dashboard-cohorte", async (event, id_periodo_ingreso) => {
  return new Promise(async (resolve, reject) => {
    try {
      const runGet = (sql, params) =>
        new Promise((res, rej) =>
          db.get(sql, params, (err, row) => (err ? rej(err) : res(row))),
        );
      const runAll = (sql, params) =>
        new Promise((res, rej) =>
          db.all(sql, params, (err, rows) => (err ? rej(err) : res(rows))),
        );

      // 1. Contador de estatus de toda la generación
      const statusCounts = await runAll(
        `
        SELECT status, COUNT(*) as total
        FROM Alumnos
        WHERE id_periodo_ingreso_fk = ?
        GROUP BY status
      `,
        [id_periodo_ingreso],
      );

      // 2. Top materias "Filtro" (las que más reprobó esta generación en toda su historia)
      const materiasFiltro = await runAll(
        `
        SELECT m.nombre_materia, COUNT(i.id_inscripcion) as reprobados
        FROM Inscripciones i
        JOIN Materias m ON i.id_materia_fk = m.id_materia
        JOIN Alumnos a ON i.id_alumno_fk = a.id_alumno
        WHERE a.id_periodo_ingreso_fk = ? AND i.estado_materia = 'Reprobada'
        GROUP BY m.id_materia
        ORDER BY reprobados DESC
        LIMIT 5
      `,
        [id_periodo_ingreso],
      );

      // 3. Promedio generacional histórico (solo de las que aprobaron)
      const promedioGen = await runGet(
        `
        SELECT AVG(i.calificacion_final) as promedio
        FROM Inscripciones i
        JOIN Alumnos a ON i.id_alumno_fk = a.id_alumno
        WHERE a.id_periodo_ingreso_fk = ? AND i.calificacion_final >= 70
      `,
        [id_periodo_ingreso],
      );

      resolve({ statusCounts, materiasFiltro, promedioGen });
    } catch (error) {
      reject(error);
    }
  });
});

// ==========================================
//    MÓDULO DE REPORTES OFICIALES (PDF)
// ==========================================

ipcMain.handle("get-alerta-temprana", async (event, id_periodo) => {
  return new Promise((resolve, reject) => {
    // 1. Buscamos a TODOS los alumnos inscritos en este periodo y calculamos en qué intento van
    const sql = `
      SELECT 
        a.id_alumno, a.numero_control, a.nombre, a.apellido_paterno, a.apellido_materno,
        m.nombre_materia,
        i.calificacion_final, i.estado_materia,
        (SELECT COUNT(*) FROM Inscripciones sub WHERE sub.id_alumno_fk = i.id_alumno_fk AND sub.id_materia_fk = i.id_materia_fk AND sub.id_periodo_fk <= i.id_periodo_fk) as num_intento
      FROM Inscripciones i
      JOIN Alumnos a ON i.id_alumno_fk = a.id_alumno
      JOIN Materias m ON i.id_materia_fk = m.id_materia
      WHERE i.id_periodo_fk = ?
    `;

    db.all(sql, [id_periodo], (err, rows) => {
      if (err) return reject(err);

      const alumnosRiesgo = {};

      // 2. Agrupamos los datos por alumno
      rows.forEach((r) => {
        if (!alumnosRiesgo[r.id_alumno]) {
          alumnosRiesgo[r.id_alumno] = {
            numero_control: r.numero_control,
            nombre_completo: `${r.apellido_paterno} ${r.apellido_materno || ""} ${r.nombre}`,
            materias_reprobadas_actuales: 0,
            materias_recurse: [],
            materias_especial: [],
          };
        }

        // Contar reprobadas en este periodo
        if (
          r.estado_materia === "Reprobada" ||
          (r.calificacion_final !== null && r.calificacion_final < 70)
        ) {
          alumnosRiesgo[r.id_alumno].materias_reprobadas_actuales++;
        }

        // Detectar Recurse (Intento 2) o Especial (Intento 3+)
        if (r.num_intento == 2) {
          alumnosRiesgo[r.id_alumno].materias_recurse.push(r.nombre_materia);
        } else if (r.num_intento >= 3) {
          alumnosRiesgo[r.id_alumno].materias_especial.push(r.nombre_materia);
        }
      });

      // 3. FILTRO FINAL: Solo devolvemos a los que están en peligro real
      const reporte = Object.values(alumnosRiesgo).filter(
        (a) =>
          a.materias_reprobadas_actuales >= 3 ||
          a.materias_recurse.length > 0 ||
          a.materias_especial.length > 0,
      );

      // Ordenamos alfabéticamente
      reporte.sort((a, b) =>
        a.nombre_completo.localeCompare(b.nombre_completo),
      );
      resolve(reporte);
    });
  });
});
