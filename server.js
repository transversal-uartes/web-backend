const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

// Configurar Zonas Horarias
dayjs.extend(utc);
dayjs.extend(timezone);
const TZ = "America/Guayaquil";

const app = express();

app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Usamos el estándar limpio JSON
app.use(express.json());

// ==========================================
// CONFIGURACIÓN SEGURA PARA GITHUB
// ==========================================
// 💡 SEGURIDAD: Jamás escribir el ID real aquí. Obligamos a que el servidor lo entregue por variable de entorno.
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

if (!SPREADSHEET_ID) {
    console.error("⚠️ ERROR CRÍTICO: No se ha definido la variable de entorno SPREADSHEET_ID.");
	process.exit(1);
}

let auth;

// 💡 SEGURIDAD: Cargar credenciales desde Variable de Entorno o Archivo .json ignorado por Git
if (process.env.GOOGLE_CREDENTIALS) {
    try {
        const keys = JSON.parse(process.env.GOOGLE_CREDENTIALS);
        auth = new google.auth.GoogleAuth({
            credentials: keys,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        console.log("✅ Credenciales de Google cargadas vía Variable de Entorno.");
    } catch (e) {
        console.error("⚠️ ERROR CRÍTICO: El JSON en GOOGLE_CREDENTIALS es inválido.", e);
    }
} else {
    // Si no hay variable de entorno, asume que se subió a mano el archivo (y que está en .gitignore)
    auth = new google.auth.GoogleAuth({
        keyFile: './credentials.json', 
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    console.log("✅ Credenciales de Google cargadas vía credentials.json local.");
}

const sheets = google.sheets({ version: 'v4', auth });
const limpiarId = (id) => (id ? String(id).replace(/'/g, "").trim() : "");

// ==========================================
// RUTA PARA EL KIOSCO
// ==========================================
app.post('/api/kiosk', async (req, res) => {
    try {
        // Como eliminamos el soporte a texto plano, asumimos que llega el body en JSON correctamente.
        const data = req.body;
        
        if (!data || !data.accion) {
             return res.json({ status: "error", msg: "Cuerpo de petición inválido o vacío." });
        }

        const accion = data.accion;
        const usuarioId = limpiarId(data.usuarioId);
        const ipCliente = data.clientIp || "Desconocida";

        // MODO TÉCNICO VÍA URL
        if (accion === 'init_kiosco' || accion === 'validar_tecnico_url' || accion === 'validar_tecnico') {
            const idTecnicoReq = limpiarId(data.tecnicoId);
            const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Tecnicos!A:D' });
            const rows = response.data.values || [];
            
            let encontrado = false;
            let nombreTecnico = "";
            
            for (let i = 1; i < rows.length; i++) {
                if (!rows[i]) continue;
                if (limpiarId(rows[i][0]) === idTecnicoReq) {
                    encontrado = true; nombreTecnico = rows[i][1]; break;
                }
            }

            if (encontrado) return res.json({ status: "ok", tecnicoValido: true, nombre: nombreTecnico, tecnicoNombre: nombreTecnico });
            else return res.json({ status: "error", msg: "Técnico no autorizado." });
        }

        // VERIFICAR USUARIO
        if (accion === 'verificar') {
            const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Usuarios!A:D' });
            const rows = response.data.values || [];
            let existe = false;
            let userInfo = { nombre: "", area: "", rol: "" };

            for (let i = 1; i < rows.length; i++) {
                if (!rows[i]) continue;
                if (limpiarId(rows[i][0]) === usuarioId) {
                    existe = true;
                    userInfo = { nombre: rows[i][1] || "", area: rows[i][2] || "", rol: rows[i][3] || "" };
                    break;
                }
            }
            return res.json({ existe, ...userInfo });
        }

        // ACTUALIZAR O REGISTRAR SOLO USUARIO
        if (accion === 'registrar_solo_usuario') {
            if (data.esNuevo) {
                await sheets.spreadsheets.values.append({
                    spreadsheetId: SPREADSHEET_ID, range: 'Usuarios!A:D', 
                    valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
                    requestBody: { values: [[`'${usuarioId}`, data.nombre, data.area, data.rol]] }
                });
            } else if (data.actualizarUsuario) {
                const resUsr = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Usuarios!A:A' });
                const ids = resUsr.data.values || [];
                const rowIndex = ids.findIndex(row => row && limpiarId(row[0]) === usuarioId);
                
                if (rowIndex > 0) {
                    await sheets.spreadsheets.values.update({
                        spreadsheetId: SPREADSHEET_ID, range: `Usuarios!B${rowIndex + 1}:D${rowIndex + 1}`, valueInputOption: 'USER_ENTERED',
                        requestBody: { values: [[data.nombre, data.area, data.rol]] }
                    });
                }
            }
            return res.json({ status: "ok" });
        }

        // REGISTRAR ENTRADA
        if (accion === 'entrada') {
            if (data.esNuevo) {
                await sheets.spreadsheets.values.append({
                    spreadsheetId: SPREADSHEET_ID, range: 'Usuarios!A:D', 
                    valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
                    requestBody: { values: [[`'${usuarioId}`, data.nombre, data.area, data.rol]] }
                });
            } else if (data.actualizarUsuario) {
                const resUsr = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Usuarios!A:A' });
                const ids = resUsr.data.values || [];
                const rowIndex = ids.findIndex(row => row && limpiarId(row[0]) === usuarioId);
                
                if (rowIndex > 0) {
                    await sheets.spreadsheets.values.update({
                        spreadsheetId: SPREADSHEET_ID, range: `Usuarios!B${rowIndex + 1}:D${rowIndex + 1}`, valueInputOption: 'USER_ENTERED',
                        requestBody: { values: [[data.nombre, data.area, data.rol]] }
                    });
                }
            }

            const dAhora = dayjs().tz(TZ);
            const fIngreso = dAhora.format('DD/MM/YYYY');
            const hIngreso = dAhora.format('HH:mm:ss');
            
            const partesTiempo = (data.tiempoEstimado || "02:00").split(':');
            const dSalidaEstimada = dAhora.add(parseInt(partesTiempo[0]), 'hour').add(parseInt(partesTiempo[1]), 'minute');
            const hSalidaEstimadaStr = dSalidaEstimada.format('HH:mm:ss');

            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID, range: 'Registros!A:L', 
                valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
                requestBody: { values: [[ fIngreso, `'${usuarioId}`, data.nombre, data.area, data.rol, data.laboratorio, data.actividad, hIngreso, hSalidaEstimadaStr, "Previsto", ipCliente, "" ]] }
            });

            return res.json({ status: "ok" });
        }

        // REGISTRAR SALIDA
        if (accion === 'salida') {
            const dAhoraOut = dayjs().tz(TZ);
            const fHoyStr = dAhoraOut.format('DD/MM/YYYY');
            const hSalidaReal = dAhoraOut.format('HH:mm:ss');

            const resReg = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Registros!A:L' });
            const rows = resReg.data.values || [];

            for (let i = rows.length - 1; i >= 1; i--) {
                if (!rows[i]) continue;
                
                // Sanitizador de Fechas
                let fechaFila = String(rows[i][0] || "").trim();
                if (fechaFila.includes('/')) {
                    let partes = fechaFila.split('/');
                    if (partes.length === 3) {
                        let d = partes[0].padStart(2, '0');
                        let m = partes[1].padStart(2, '0');
                        let y = partes[2];
                        fechaFila = `${d}/${m}/${y}`;
                    }
                }
                
                const estado = String(rows[i][9] || "").trim();

                if (limpiarId(rows[i][1]) === usuarioId && fechaFila === fHoyStr && estado === "Previsto") {
                    await sheets.spreadsheets.values.update({
                        spreadsheetId: SPREADSHEET_ID, range: `Registros!I${i + 1}:L${i + 1}`, valueInputOption: 'USER_ENTERED',
                        requestBody: { values: [[hSalidaReal, "Confirmado", rows[i][10] || "", ipCliente]] }
                    });
                    return res.json({ status: "ok" });
                }
            }
            return res.json({ status: "error", msg: "No se encontró registro Previsto para hoy." });
        }

        // OBTENER PRÉSTAMOS
        if (accion === 'obtener_prestamos') {
            const resAp = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Prestamos!A:H' });
            const rows = resAp.data.values || [];
            const prestamos = [];
            for (let i = 1; i < rows.length; i++) {
                if (!rows[i]) continue;
                prestamos.push({
                    apId: String(rows[i][0] || ""), apInfo: String(rows[i][1] || ""),
                    idRecepcion: String(rows[i][2] || ""), idDevolucion: String(rows[i][5] || "")
                });
            }
            return res.json({ status: "ok", prestamos });
        }

        if (accion === 'crear_ap') {
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID, range: 'Prestamos!A:B', 
                valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
                requestBody: { values: [[`'${data.apId}`, data.apInfo]] }
            });
            return res.json({ status: "ok" });
        }

        if (accion === 'editar_ap') {
            const resAp = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Prestamos!A:A' });
            const ids = resAp.data.values || [];
            const rowIndex = ids.findIndex(row => row && String(row[0]) === data.apId);
            
            if (rowIndex > 0) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID, range: `Prestamos!B${rowIndex + 1}`, valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [[data.apInfo]] }
                });
                return res.json({ status: "ok" });
            }
            return res.json({ status: "error", msg: "AP no encontrado." });
        }

        if (accion === 'registrar_prestamo') {
            const resAp = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Prestamos!A:A' });
            const rows = resAp.data.values || [];
            const dAhora = dayjs().tz(TZ);
            const fechaStr = dAhora.format('DD/MM/YYYY');
            const horaStr = dAhora.format('HH:mm:ss');
            const techIdStr = limpiarId(data.tecnicoId); 
            
            for (let r = 1; r < rows.length; r++) {
                if (!rows[r]) continue;
                if (String(rows[r][0]) === String(data.apId)) {
                    if (data.tipoRegistro === 'recepcion') {
                        await sheets.spreadsheets.values.update({
                            spreadsheetId: SPREADSHEET_ID, range: `Prestamos!C${r + 1}:E${r + 1}`, valueInputOption: 'USER_ENTERED',
                            requestBody: { values: [[`'${usuarioId}`, fechaStr, horaStr]] }
                        });
                        await sheets.spreadsheets.values.update({
                            spreadsheetId: SPREADSHEET_ID, range: `Prestamos!I${r + 1}`, valueInputOption: 'USER_ENTERED',
                            requestBody: { values: [[`'${techIdStr}`]] }
                        });
                    } else if (data.tipoRegistro === 'devolucion') {
                        await sheets.spreadsheets.values.update({
                            spreadsheetId: SPREADSHEET_ID, range: `Prestamos!F${r + 1}:H${r + 1}`, valueInputOption: 'USER_ENTERED',
                            requestBody: { values: [[`'${usuarioId}`, fechaStr, horaStr]] }
                        });
                        await sheets.spreadsheets.values.update({
                            spreadsheetId: SPREADSHEET_ID, range: `Prestamos!J${r + 1}`, valueInputOption: 'USER_ENTERED',
                            requestBody: { values: [[`'${techIdStr}`]] }
                        });
                    }
                    return res.json({ status: "ok" });
                }
            }
            return res.json({ status: "error", msg: "No se encontró el Acta de Préstamo." });
        }

        return res.json({ status: "error", msg: "Acción no reconocida." });

    } catch (error) {
        console.error(error);
        return res.json({ status: "error", msg: "Error del servidor: " + error.message });
    }
});

const PORT = process.env.PORT || 8100;
const IP = process.env.IP || '0.0.0.0';
app.listen(PORT, IP, () => { console.log(`Backend Kiosco corriendo en http://${IP}:${PORT}`); });
