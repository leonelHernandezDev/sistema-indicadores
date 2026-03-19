// seed.js
const { app } = require("electron");
app.setName("sistemaindicadores");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");

app.whenReady().then(async () => {
  console.log(
    "Iniciando inyección (1,260 Alumnos - Historial Continuo Perfecto)...",
  );
  const dbPath = path.join(app.getPath("userData"), "datos_academicos.sqlite");
  const db = new sqlite3.Database(dbPath);

  const run = (sql, params = []) =>
    new Promise((res, rej) =>
      db.run(sql, params, function (err) {
        if (err) rej(err);
        else res(this);
      }),
    );

  try {
    console.log("1. Limpiando y recreando base de datos...");
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

    await run(
      `CREATE TABLE Usuarios (id_usuario INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL)`,
    );
    await run(
      `CREATE TABLE PeriodosEscolares (id_periodo INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT UNIQUE NOT NULL)`,
    );
    await run(
      `CREATE TABLE Grupos (id_grupo INTEGER PRIMARY KEY AUTOINCREMENT, nombre_grupo TEXT NOT NULL, id_periodo_fk INTEGER NOT NULL)`,
    );
    await run(
      `CREATE TABLE Materias (id_materia INTEGER PRIMARY KEY AUTOINCREMENT, nombre_materia TEXT NOT NULL, semestre_ideal INTEGER, creditos INTEGER DEFAULT 5)`,
    );
    await run(
      `CREATE TABLE Alumnos (id_alumno INTEGER PRIMARY KEY AUTOINCREMENT, numero_control TEXT UNIQUE NOT NULL, nombre TEXT NOT NULL, apellido_paterno TEXT NOT NULL, apellido_materno TEXT, genero TEXT, fecha_nacimiento TEXT, status TEXT, id_periodo_ingreso_fk INTEGER)`,
    );

    // AQUI YA INCLUYE C9, C10 Y LAS FECHAS
    await run(
      `CREATE TABLE Inscripciones (id_inscripcion INTEGER PRIMARY KEY AUTOINCREMENT, id_alumno_fk INTEGER, id_materia_fk INTEGER, id_periodo_fk INTEGER, id_grupo_fk INTEGER, c1 REAL, c2 REAL, c3 REAL, c4 REAL, c5 REAL, c6 REAL, c7 REAL, c8 REAL, c9 REAL, c10 REAL, calificacion_final REAL, estado_materia TEXT DEFAULT 'Cursando', tipo_acreditacion TEXT DEFAULT 'CN', fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP, fecha_modificacion DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    );

    await run(
      `CREATE TABLE Titulados (id_titulacion INTEGER PRIMARY KEY AUTOINCREMENT, id_alumno_fk INTEGER, fecha_titulacion TEXT, modalidad TEXT, folio_acta TEXT, promedio REAL, mencion_honorifica INTEGER)`,
    );

    // Admin
    const hash = await bcrypt.hash("admin", await bcrypt.genSalt(10));
    await run("INSERT INTO Usuarios (username, password_hash) VALUES (?, ?)", [
      "admin",
      hash,
    ]);

    // 21 Periodos Escolares
    const nombresPeriodos = [
      "2016-1",
      "2016-2",
      "2017-1",
      "2017-2",
      "2018-1",
      "2018-2",
      "2019-1",
      "2019-2",
      "2020-1",
      "2020-2",
      "2021-1",
      "2021-2",
      "2022-1",
      "2022-2",
      "2023-1",
      "2023-2",
      "2024-1",
      "2024-2",
      "2025-1",
      "2025-2",
      "2026-1",
    ];
    let pIds = [];
    for (let p of nombresPeriodos) {
      let res = await run("INSERT INTO PeriodosEscolares (nombre) VALUES (?)", [
        p,
      ]);
      pIds.push(res.lastID);
    }

    // Plan de Estudios ISIC (TESCI)
    const materiasISIC = [
      { n: "Cálculo Diferencial", s: 1 },
      { n: "Fundamentos de Programación", s: 1 },
      { n: "Taller de Ética", s: 1 },
      { n: "Matemáticas Discretas", s: 1 },
      { n: "Taller de Administración", s: 1 },
      { n: "Fundamentos de Investigación", s: 1 },
      { n: "Cálculo Integral", s: 2 },
      { n: "Programación Orientada a Objetos", s: 2 },
      { n: "Contabilidad Financiera", s: 2 },
      { n: "Química", s: 2 },
      { n: "Álgebra Lineal", s: 2 },
      { n: "Probabilidad y Estadística", s: 2 },
      { n: "Cálculo Vectorial", s: 3 },
      { n: "Estructura de Datos", s: 3 },
      { n: "Cultura Empresarial", s: 3 },
      { n: "Investigación de Operaciones", s: 3 },
      { n: "Desarrollo Sustentable", s: 3 },
      { n: "Física General", s: 3 },
      { n: "Ecuaciones Diferenciales", s: 4 },
      { n: "Métodos Numéricos", s: 4 },
      { n: "Principios Eléctricos", s: 4 },
      { n: "Tópicos Avanzados de Programación", s: 4 },
      { n: "Fundamentos de Bases de Datos", s: 4 },
      { n: "Simulación", s: 4 },
      { n: "Graficación", s: 5 },
      { n: "Fundamentos de Telecomunicaciones", s: 5 },
      { n: "Sistemas Operativos", s: 5 },
      { n: "Taller de Bases de Datos", s: 5 },
      { n: "Arquitectura de Computadoras", s: 5 },
      { n: "Ingeniería de Software", s: 5 },
      { n: "Lenguajes y Autómatas I", s: 6 },
      { n: "Redes de Computadoras", s: 6 },
      { n: "Taller de Sistemas Operativos", s: 6 },
      { n: "Administración de Bases de Datos", s: 6 },
      { n: "Programación Web", s: 6 },
      { n: "Arquitectura de Software", s: 6 },
      { n: "Lenguajes y Autómatas II", s: 7 },
      { n: "Conmutación y Enrutamiento", s: 7 },
      { n: "Programación Lógica y Funcional", s: 7 },
      { n: "Administración de Redes", s: 7 },
      { n: "Desarrollo de Aplicaciones Móviles", s: 7 },
      { n: "Gestión de Proyectos de Software", s: 7 },
      { n: "Inteligencia Artificial", s: 8 },
      { n: "Tecnologías de Virtualización", s: 8 },
      { n: "Gestión de Seguridad", s: 8 },
      { n: "Auditoría Informática", s: 8 },
      { n: "Desarrollo Cloud", s: 8 },
      { n: "Taller de Investigación I", s: 8 },
      { n: "Residencia Profesional", s: 9 },
      { n: "Sistemas Distribuidos", s: 9 },
      { n: "Big Data", s: 9 },
      { n: "Taller de Investigación II", s: 9 },
      { n: "Internet de las Cosas", s: 9 },
      { n: "Servicio Social", s: 9 },
    ];

    let mIds = [];
    for (let mat of materiasISIC) {
      let res = await run(
        "INSERT INTO Materias (nombre_materia, semestre_ideal, creditos) VALUES (?, ?, ?)",
        [mat.n, mat.s, 5],
      );
      mIds.push({ id: res.lastID, sem: mat.s });
    }

    // CORRECCIÓN: Crear grupos para TODOS los periodos (del 0 al 20)
    let gIds = {};
    for (let p = 0; p <= 20; p++) {
      let id_per = pIds[p];
      gIds[id_per] = {};
      for (let sem = 1; sem <= 9; sem++) {
        let resM = await run(
          "INSERT INTO Grupos (nombre_grupo, id_periodo_fk) VALUES (?, ?)",
          [`3${sem}1-M`, id_per],
        );
        gIds[id_per][`3${sem}1-M`] = resM.lastID;
        let resV = await run(
          "INSERT INTO Grupos (nombre_grupo, id_periodo_fk) VALUES (?, ?)",
          [`3${sem}2-V`, id_per],
        );
        gIds[id_per][`3${sem}2-V`] = resV.lastID;
      }
    }

    console.log("2. Sembrando 1,260 Alumnos (21 Generaciones)...");
    const nombresM = [
      "Alejandro",
      "Jose",
      "Juan",
      "Luis",
      "Carlos",
      "Miguel",
      "Diego",
      "Jorge",
      "Daniel",
      "Eduardo",
      "Fernando",
      "Ricardo",
      "Javier",
    ];
    const nombresF = [
      "Maria",
      "Ana",
      "Sofia",
      "Laura",
      "Lucia",
      "Valeria",
      "Fernanda",
      "Andrea",
      "Diana",
      "Mariana",
      "Patricia",
      "Gabriela",
      "Paola",
    ];
    const apellidos = [
      "Garcia",
      "Martinez",
      "Lopez",
      "Gonzalez",
      "Perez",
      "Rodriguez",
      "Sanchez",
      "Ramirez",
      "Cruz",
      "Gomez",
      "Flores",
      "Morales",
      "Vazquez",
      "Jimenez",
      "Reyes",
      "Diaz",
      "Torres",
      "Gutierrez",
      "Ruiz",
      "Mendoza",
    ];

    await run("BEGIN TRANSACTION");
    let alumnos = [];

    for (let c = 0; c <= 20; c++) {
      let year = nombresPeriodos[c].split("-")[0];
      for (let i = 1; i <= 60; i++) {
        let isMasc = Math.random() > 0.5;
        let gen = isMasc ? "Masculino" : "Femenino";
        let nom = isMasc
          ? nombresM[Math.floor(Math.random() * nombresM.length)]
          : nombresF[Math.floor(Math.random() * nombresF.length)];
        let ap1 = apellidos[Math.floor(Math.random() * apellidos.length)];
        let ap2 = apellidos[Math.floor(Math.random() * apellidos.length)];

        let nc = `${year}31${String(c).padStart(2, "0")}${String(i).padStart(2, "0")}`;

        let res = await run(
          "INSERT INTO Alumnos (numero_control, nombre, apellido_paterno, apellido_materno, genero, status, id_periodo_ingreso_fk) VALUES (?, ?, ?, ?, ?, 'Activo', ?)",
          [nc, nom, ap1, ap2, gen, pIds[c]],
        );

        alumnos.push({
          id: res.lastID,
          cohort: c,
          num_lista: i,
          numero_control: nc,
        });
      }
    }
    await run("COMMIT");

    console.log(
      "3. Evaluando Kárdex (Simulación desde el día 1 de clases de cada alumno)...",
    );
    await run("BEGIN TRANSACTION");
    let totalInsc = 0;

    // CORRECCIÓN: Recorremos TODOS los periodos (del 0 al 20)
    for (let p = 0; p <= 20; p++) {
      let id_periodo = pIds[p];
      let isActualPeriod = p === 20; // 2026-1

      for (let sem = 1; sem <= 9; sem++) {
        let activeCohort = p - sem + 1;
        if (activeCohort < 0 || activeCohort > 20) continue; // Generación aún no entra o ya salió

        let studentsInCohort = alumnos.filter((a) => a.cohort === activeCohort);
        let id_grupo_M = gIds[id_periodo][`3${sem}1-M`];
        let id_grupo_V = gIds[id_periodo][`3${sem}2-V`];
        let materiasSem = mIds.filter((m) => m.sem === sem);

        for (let student of studentsInCohort) {
          let id_grupo = student.num_lista <= 30 ? id_grupo_M : id_grupo_V;

          for (let mat of materiasSem) {
            let r = Math.random();
            let calif, estado, acred, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10;

            if (isActualPeriod) {
              c1 = Math.floor(Math.random() * 40) + 60;
              if (c1 < 70) c1 = 0;
              c2 = Math.floor(Math.random() * 40) + 60;
              if (c2 < 70) c2 = 0;
              calif = null;
              estado = "Cursando";
              acred = "CN";
              c3 = null;
              c4 = null;
              c5 = null;
              c6 = null;
              c7 = null;
              c8 = null;
              c9 = null;
              c10 = null;
            } else {
              if (r > 0.2) {
                calif = Math.floor(Math.random() * 30) + 70;
                estado = "Aprobada";
                acred = "CN";
              } else if (r > 0.1) {
                calif = Math.floor(Math.random() * 30) + 70;
                estado = "Aprobada";
                acred = "SO";
              } else if (r > 0.05) {
                calif = Math.floor(Math.random() * 30) + 70;
                estado = "Aprobada";
                acred = "CI";
              } else {
                calif = 0;
                estado = "Reprobada";
                acred = "NA";
              }
              c1 = calif === 0 ? 0 : calif + Math.floor(Math.random() * 10 - 5);
              c2 = calif === 0 ? 0 : calif + Math.floor(Math.random() * 10 - 5);
              c3 = calif === 0 ? 0 : calif + Math.floor(Math.random() * 10 - 5);
              c4 = calif === 0 ? 0 : calif + Math.floor(Math.random() * 10 - 5);
              c5 = null;
              c6 = null;
              c7 = null;
              c8 = null;
              c9 = null;
              c10 = null;
            }

            await run(
              `INSERT INTO Inscripciones (id_alumno_fk, id_materia_fk, id_periodo_fk, id_grupo_fk, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, calificacion_final, estado_materia, tipo_acreditacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                student.id,
                mat.id,
                id_periodo,
                id_grupo,
                c1,
                c2,
                c3,
                c4,
                c5,
                c6,
                c7,
                c8,
                c9,
                c10,
                calif,
                estado,
                acred,
              ],
            );
            totalInsc++;
          }
        }
      }
    }
    await run("COMMIT");

    console.log("4. Calculando Estatus Finales y Titulaciones...");
    await run("BEGIN TRANSACTION");
    for (let student of alumnos) {
      let semFinal = 20 - student.cohort + 1;
      let statusFinal = "Activo";

      if (semFinal > 9) {
        statusFinal = Math.random() > 0.3 ? "Titulado" : "Egresado";
      } else if (semFinal > 3 && Math.random() < 0.1) {
        statusFinal = Math.random() > 0.5 ? "Baja Temporal" : "Desertor";
      }

      await run("UPDATE Alumnos SET status = ? WHERE id_alumno = ?", [
        statusFinal,
        student.id,
      ]);

      if (statusFinal === "Titulado") {
        await run(
          "INSERT INTO Titulados (id_alumno_fk, fecha_titulacion, modalidad, folio_acta, promedio, mencion_honorifica) VALUES (?, ?, ?, ?, ?, ?)",
          [
            student.id,
            "2025-12-10",
            "Tesis Profesional",
            `ACT-${student.numero_control}`,
            (Math.random() * 20 + 80).toFixed(1),
            Math.random() > 0.8 ? 1 : 0,
          ],
        );
      }
    }
    await run("COMMIT");

    console.log(
      `✅ ¡ÉXITO! Base de datos construida con ${totalInsc} registros cruzados perfectos.`,
    );
    app.quit();
  } catch (error) {
    console.error("❌ ERROR FATAL:", error);
    app.quit();
  }
});
