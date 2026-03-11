// seed.js
const { app } = require("electron");
app.setName("sistemaindicadores"); // <--- ESTA ES LA LLAVE MÁGICA
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");

app.whenReady().then(async () => {
  console.log("Iniciando inyección masiva de datos...");
  const dbPath = path.join(app.getPath("userData"), "datos_academicos.sqlite");
  const db = new sqlite3.Database(dbPath);

  // Wrapper para usar Promesas con SQLite
  const run = (sql, params = []) =>
    new Promise((res, rej) =>
      db.run(sql, params, function (err) {
        if (err) rej(err);
        else res(this);
      }),
    );
  const get = (sql, params = []) =>
    new Promise((res, rej) =>
      db.get(sql, params, (err, row) => (err ? rej(err) : res(row))),
    );

  try {
    // 1. REINICIAR LA BASE DE DATOS
    console.log("1. Limpiando base de datos...");
    await run("PRAGMA foreign_keys = OFF");
    const tablas = [
      "Inscripciones",
      "Titulados",
      "Materias",
      "Grupos",
      "Alumnos",
      "PeriodosEscolares",
      "Usuarios",
    ];
    for (let t of tablas) await run(`DROP TABLE IF EXISTS ${t}`);
    await run("PRAGMA foreign_keys = ON");

    // 2. CREAR TABLAS (Esquema Oficial)
    console.log("2. Recreando estructura de tablas...");
    await run(
      `CREATE TABLE Usuarios (id_usuario INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL)`,
    );
    await run(
      `CREATE TABLE PeriodosEscolares (id_periodo INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT UNIQUE NOT NULL)`,
    );
    await run(
      `CREATE TABLE Grupos (id_grupo INTEGER PRIMARY KEY AUTOINCREMENT, nombre_grupo TEXT NOT NULL, id_periodo_fk INTEGER NOT NULL, FOREIGN KEY (id_periodo_fk) REFERENCES PeriodosEscolares(id_periodo) ON DELETE RESTRICT)`,
    );
    await run(
      `CREATE TABLE Materias (id_materia INTEGER PRIMARY KEY AUTOINCREMENT, nombre_materia TEXT NOT NULL, semestre_ideal INTEGER, creditos INTEGER DEFAULT 0)`,
    );
    await run(
      `CREATE TABLE Alumnos (id_alumno INTEGER PRIMARY KEY AUTOINCREMENT, numero_control TEXT UNIQUE NOT NULL, nombre TEXT NOT NULL, apellido_paterno TEXT NOT NULL, apellido_materno TEXT, genero TEXT, fecha_nacimiento TEXT, status TEXT, id_periodo_ingreso_fk INTEGER, FOREIGN KEY (id_periodo_ingreso_fk) REFERENCES PeriodosEscolares(id_periodo) ON DELETE RESTRICT)`,
    );
    await run(
      `CREATE TABLE Inscripciones (id_inscripcion INTEGER PRIMARY KEY AUTOINCREMENT, id_alumno_fk INTEGER NOT NULL, id_materia_fk INTEGER NOT NULL, id_periodo_fk INTEGER NOT NULL, id_grupo_fk INTEGER NOT NULL, c1 REAL, c2 REAL, c3 REAL, c4 REAL, c5 REAL, c6 REAL, c7 REAL, c8 REAL, calificacion_final REAL, estado_materia TEXT DEFAULT 'Cursando', tipo_acreditacion TEXT DEFAULT 'CN', fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP, fecha_modificacion DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    );

    // 3. CREAR ADMIN
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash("admin", salt);
    await run("INSERT INTO Usuarios (username, password_hash) VALUES (?, ?)", [
      "admin",
      hash,
    ]);

    // 4. PERIODOS (7 Semestres de historia)
    const nombresPeriodos = [
      "2023-1",
      "2023-2",
      "2024-1",
      "2024-2",
      "2025-1",
      "2025-2",
      "2026-1",
    ];
    let idPeriodos = [];
    for (let p of nombresPeriodos) {
      let res = await run("INSERT INTO PeriodosEscolares (nombre) VALUES (?)", [
        p,
      ]);
      idPeriodos.push(res.lastID);
    }

    // 5. MATERIAS (42 Materias Reales)
    console.log("3. Generando Plan de Estudios...");
    const planEstudios = [
      // Semestre 1
      { n: "Cálculo Diferencial", s: 1, c: 5 },
      { n: "Fundamentos de Programación", s: 1, c: 5 },
      { n: "Taller de Ética", s: 1, c: 4 },
      { n: "Matemáticas Discretas", s: 1, c: 5 },
      { n: "Taller de Administración", s: 1, c: 4 },
      { n: "Fundamentos de Investigación", s: 1, c: 4 },
      // Semestre 2
      { n: "Cálculo Integral", s: 2, c: 5 },
      { n: "Programación Orientada a Objetos", s: 2, c: 5 },
      { n: "Contabilidad Financiera", s: 2, c: 4 },
      { n: "Química", s: 2, c: 4 },
      { n: "Álgebra Lineal", s: 2, c: 5 },
      { n: "Probabilidad y Estadística", s: 2, c: 5 },
      // Semestre 3
      { n: "Cálculo Vectorial", s: 3, c: 5 },
      { n: "Estructura de Datos", s: 3, c: 5 },
      { n: "Cultura Empresarial", s: 3, c: 4 },
      { n: "Inv. de Operaciones", s: 3, c: 4 },
      { n: "Desarrollo Sustentable", s: 3, c: 5 },
      { n: "Física General", s: 3, c: 5 },
      // Semestre 4
      { n: "Ecuaciones Diferenciales", s: 4, c: 5 },
      { n: "Métodos Numéricos", s: 4, c: 4 },
      { n: "Principios Eléctricos", s: 4, c: 5 },
      { n: "Tópicos Avanzados Prog.", s: 4, c: 5 },
      { n: "Fundamentos de BD", s: 4, c: 5 },
      { n: "Simulación", s: 4, c: 5 },
      // Semestre 5
      { n: "Graficación", s: 5, c: 4 },
      { n: "Fundamentos Telecom.", s: 5, c: 4 },
      { n: "Sistemas Operativos", s: 5, c: 4 },
      { n: "Taller de BD", s: 5, c: 4 },
      { n: "Arq. de Computadoras", s: 5, c: 5 },
      { n: "Ingeniería de Software", s: 5, c: 5 },
      // Semestre 6
      { n: "Lenguajes y Autómatas I", s: 6, c: 5 },
      { n: "Redes de Computadoras", s: 6, c: 5 },
      { n: "Taller de SO", s: 6, c: 4 },
      { n: "Admin. de BD", s: 6, c: 5 },
      { n: "Programación Web", s: 6, c: 5 },
      { n: "Arquitectura de Software", s: 6, c: 4 },
      // Semestre 7
      { n: "Lenguajes y Autómatas II", s: 7, c: 5 },
      { n: "Conmutación y Enrutamiento", s: 7, c: 5 },
      { n: "Programación Lógica", s: 7, c: 4 },
      { n: "Admin. de Redes", s: 7, c: 5 },
      { n: "Desarrollo Móvil", s: 7, c: 5 },
      { n: "Gestión de Proyectos", s: 7, c: 4 },
    ];
    for (let m of planEstudios) {
      let res = await run(
        "INSERT INTO Materias (nombre_materia, semestre_ideal, creditos) VALUES (?, ?, ?)",
        [m.n, m.s, m.c],
      );
      m.id = res.lastID;
    }

    // 6. GRUPOS (2 Grupos por Periodo: M y V)
    let gruposPorPeriodo = {};
    for (let i = 0; i < idPeriodos.length; i++) {
      let id_p = idPeriodos[i];
      let resA = await run(
        "INSERT INTO Grupos (nombre_grupo, id_periodo_fk) VALUES (?, ?)",
        [`${i + 1}01-M`, id_p],
      );
      let resB = await run(
        "INSERT INTO Grupos (nombre_grupo, id_periodo_fk) VALUES (?, ?)",
        [`${i + 1}02-V`, id_p],
      );
      gruposPorPeriodo[i] = [resA.lastID, resB.lastID]; // Indice 0 es Semestre 1
    }

    // 7. ALUMNOS (60 Alumnos)
    console.log("4. Inscribiendo 60 Alumnos...");
    const nombres = [
      "Alejandro",
      "María",
      "José",
      "Carmen",
      "Juan",
      "Ana",
      "Luis",
      "Laura",
      "Carlos",
      "Marta",
      "Jorge",
      "Patricia",
      "Eduardo",
      "Lucía",
      "Miguel",
      "Teresa",
      "Daniel",
      "Sofía",
      "David",
      "Elena",
    ];
    const apellidos = [
      "Hernández",
      "García",
      "Martínez",
      "López",
      "González",
      "Pérez",
      "Rodríguez",
      "Sánchez",
      "Ramírez",
      "Cruz",
      "Gómez",
      "Flores",
      "Morales",
      "Vázquez",
      "Jiménez",
      "Reyes",
      "Díaz",
      "Torres",
    ];

    let alumnosIds = [];
    await run("BEGIN TRANSACTION");
    for (let i = 1; i <= 60; i++) {
      let nom = nombres[Math.floor(Math.random() * nombres.length)];
      let ap1 = apellidos[Math.floor(Math.random() * apellidos.length)];
      let ap2 = apellidos[Math.floor(Math.random() * apellidos.length)];
      let nc = `23${String(i).padStart(4, "0")}`; // Ej: 230001
      let gen = nom.endsWith("a") ? "Femenino" : "Masculino";

      let res = await run(
        "INSERT INTO Alumnos (numero_control, nombre, apellido_paterno, apellido_materno, genero, status, id_periodo_ingreso_fk) VALUES (?, ?, ?, ?, ?, 'Activo', ?)",
        [nc, nom, ap1, ap2, gen, idPeriodos[0]],
      );
      alumnosIds.push(res.lastID);
    }
    await run("COMMIT");

    // 8. CALIFICACIONES (La Magia Histórica)
    console.log(
      "5. Simulando 7 semestres de calificaciones (+2500 registros)...",
    );
    await run("BEGIN TRANSACTION");

    for (let indexAlumno = 0; indexAlumno < alumnosIds.length; indexAlumno++) {
      let id_alumno = alumnosIds[indexAlumno];
      let esGrupoM = indexAlumno < 30; // Primeros 30 al grupo M, resto al V

      // Avanzamos por los 7 semestres
      for (let semestre = 1; semestre <= 7; semestre++) {
        let id_periodo = idPeriodos[semestre - 1];
        let id_grupo = esGrupoM
          ? gruposPorPeriodo[semestre - 1][0]
          : gruposPorPeriodo[semestre - 1][1];

        // Obtenemos las 6 materias de ese semestre
        let materiasDelSemestre = planEstudios.filter((m) => m.s === semestre);

        for (let mat of materiasDelSemestre) {
          // Lógica de calificación (15% reprobados, 85% aprobados)
          let suerte = Math.random();
          let calif = 0;
          let estado = "";

          if (suerte > 0.15) {
            calif = Math.floor(Math.random() * (100 - 70 + 1)) + 70; // 70 a 100
            estado = "Aprobada";
          } else {
            calif = Math.floor(Math.random() * (69 - 40 + 1)) + 40; // 40 a 69
            estado = "Reprobada";
          }

          // Simulamos parciales C1-C4 (con un margen de +- 5 puntos de la final)
          let c1 = calif + Math.floor(Math.random() * 10 - 5);
          let c2 = calif + Math.floor(Math.random() * 10 - 5);
          let c3 = calif + Math.floor(Math.random() * 10 - 5);
          let c4 = calif + Math.floor(Math.random() * 10 - 5);

          // Acreditación (Un 10% pasa en Segunda Oportunidad 'SO')
          let tipo_acred = calif >= 70 && Math.random() > 0.9 ? "SO" : "CN";

          await run(
            `
            INSERT INTO Inscripciones 
            (id_alumno_fk, id_materia_fk, id_periodo_fk, id_grupo_fk, c1, c2, c3, c4, calificacion_final, estado_materia, tipo_acreditacion) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id_alumno,
              mat.id,
              id_periodo,
              id_grupo,
              c1,
              c2,
              c3,
              c4,
              calif,
              estado,
              tipo_acred,
            ],
          );
        }
      }
    }
    await run("COMMIT");

    console.log("✅ ¡INYECCIÓN MASIVA COMPLETADA CON ÉXITO!");
    console.log("Inicia tu aplicación, usa las credenciales:");
    console.log("Usuario: admin");
    console.log("Password: admin");
    app.quit(); // Cerramos el proceso limpiamente
  } catch (error) {
    console.error("❌ ERROR FATAL DURANTE LA INYECCIÓN:", error);
    app.quit();
  }
});
