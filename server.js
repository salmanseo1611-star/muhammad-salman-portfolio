const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = 3000;
const HOST = "localhost";

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";

const sessions = new Map();

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf"
};


// =========================
// READ CONTACT MESSAGES
// =========================
function readContacts() {

    const file = path.join(__dirname, "contacts.json");

    if (!fs.existsSync(file)) {
        return [];
    }

    try {

        const data = JSON.parse(
            fs.readFileSync(file, "utf8") || "[]"
        );

        return Array.isArray(data) ? data : [];

    } catch (error) {

        console.error(
            "Could not read contacts.json:",
            error
        );

        return [];
    }
}


// =========================
// SAVE CONTACT MESSAGES
// =========================
function saveContacts(contacts) {

    const file = path.join(
        __dirname,
        "contacts.json"
    );

    fs.writeFileSync(
        file,
        JSON.stringify(contacts, null, 2),
        "utf8"
    );
}


// =========================
// ADD IDs TO OLD MESSAGES
// =========================
function ensureMessageIds(contacts) {

    let changed = false;

    const updated = contacts.map(contact => {

        if (!contact.id) {

            changed = true;

            return {
                id: crypto.randomUUID(),
                ...contact
            };
        }

        return contact;
    });

    if (changed) {
        saveContacts(updated);
    }

    return updated;
}


// =========================
// PARSE COOKIES
// =========================
function parseCookies(req) {

    const cookies = {};

    const header = req.headers.cookie || "";

    header.split(";").forEach(cookie => {

        const parts = cookie.trim().split("=");

        if (parts.length >= 2) {

            cookies[parts[0]] =
                parts.slice(1).join("=");
        }
    });

    return cookies;
}


// =========================
// CHECK LOGIN
// =========================
function isLoggedIn(req) {

    const cookies = parseCookies(req);

    const sid = cookies.sid;

    return Boolean(
        sid && sessions.has(sid)
    );
}


// =========================
// SEND JSON
// =========================
function sendJSON(res, status, data) {

    res.writeHead(status, {

        "Content-Type":
            "application/json; charset=utf-8",

        "Cache-Control":
            "no-store"
    });

    res.end(
        JSON.stringify(data)
    );
}


// =========================
// CREATE SERVER
// =========================
const server = http.createServer(
    (req, res) => {


    // =========================
    // LOGIN
    // =========================
    if (
        req.method === "POST" &&
        req.url === "/login"
    ) {

        let body = "";

        req.on("data", chunk => {

            body += chunk.toString();

            if (body.length > 10000) {
                req.destroy();
            }
        });

        req.on("end", () => {

            try {

                const data =
                    JSON.parse(body);

                const username =
                    String(
                        data.username || ""
                    );

                const password =
                    String(
                        data.password || ""
                    );


                if (
                    username !== ADMIN_USER ||
                    password !== ADMIN_PASS
                ) {

                    sendJSON(
                        res,
                        401,
                        {
                            success: false,
                            message:
                                "Invalid username or password"
                        }
                    );

                    return;
                }


                const sid =
                    crypto
                    .randomBytes(32)
                    .toString("hex");


                sessions.set(
                    sid,
                    {
                        username,
                        created: Date.now()
                    }
                );


                res.writeHead(
                    200,
                    {

                        "Content-Type":
                            "application/json; charset=utf-8",

                        "Cache-Control":
                            "no-store",

                        "Set-Cookie":
                            `sid=${sid}; HttpOnly; SameSite=Lax; Path=/`
                    }
                );


                res.end(
                    JSON.stringify({
                        success: true
                    })
                );


            } catch (error) {

                sendJSON(
                    res,
                    400,
                    {
                        success: false,
                        message:
                            "Invalid request"
                    }
                );
            }
        });

        return;
    }


    // =========================
    // LOGOUT
    // =========================
    if (
        req.method === "POST" &&
        req.url === "/logout"
    ) {

        const cookies =
            parseCookies(req);

        const sid = cookies.sid;

        if (sid) {
            sessions.delete(sid);
        }


        res.writeHead(
            200,
            {

                "Content-Type":
                    "application/json; charset=utf-8",

                "Cache-Control":
                    "no-store",

                "Set-Cookie":
                    "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
            }
        );


        res.end(
            JSON.stringify({
                success: true
            })
        );

        return;
    }


    // =========================
    // GET MESSAGES
    // =========================
    if (
        req.method === "GET" &&
        req.url === "/api/messages"
    ) {

        if (!isLoggedIn(req)) {

            sendJSON(
                res,
                401,
                {
                    success: false,
                    message:
                        "Unauthorized"
                }
            );

            return;
        }


        const contacts =
            ensureMessageIds(
                readContacts()
            );


        sendJSON(
            res,
            200,
            contacts
        );

        return;
    }


    // =========================
    // DELETE MESSAGE
    // =========================
    if (
        req.method === "DELETE" &&
        req.url.startsWith(
            "/api/messages/"
        )
    ) {

        if (!isLoggedIn(req)) {

            sendJSON(
                res,
                401,
                {
                    success: false,
                    message:
                        "Unauthorized"
                }
            );

            return;
        }


        let id;

        try {

            id = decodeURIComponent(
                req.url
                    .split(
                        "/api/messages/"
                    )[1]
                    .split("?")[0]
            );

        } catch {

            sendJSON(
                res,
                400,
                {
                    success: false,
                    message:
                        "Invalid message ID"
                }
            );

            return;
        }


        if (!id) {

            sendJSON(
                res,
                400,
                {
                    success: false,
                    message:
                        "Message ID is required"
                }
            );

            return;
        }


        const contacts =
            ensureMessageIds(
                readContacts()
            );


        const index =
            contacts.findIndex(
                contact =>
                    String(contact.id) ===
                    String(id)
            );


        if (index === -1) {

            sendJSON(
                res,
                404,
                {
                    success: false,
                    message:
                        "Message not found"
                }
            );

            return;
        }


        contacts.splice(
            index,
            1
        );


        saveContacts(
            contacts
        );


        console.log(
            "Message Deleted:",
            id
        );


        sendJSON(
            res,
            200,
            {
                success: true,
                message:
                    "Message deleted successfully"
            }
        );

        return;
    }


    // =========================
    // OLD MESSAGES ROUTE
    // =========================
    if (
        req.method === "GET" &&
        req.url === "/messages"
    ) {

        if (!isLoggedIn(req)) {

            sendJSON(
                res,
                401,
                {
                    success: false,
                    message:
                        "Unauthorized"
                }
            );

            return;
        }


        const contacts =
            ensureMessageIds(
                readContacts()
            );


        sendJSON(
            res,
            200,
            contacts
        );

        return;
    }


    // =========================
    // CONTACT FORM
    // =========================
    if (
        req.method === "POST" &&
        req.url === "/contact"
    ) {

        let body = "";

        req.on("data", chunk => {

            body += chunk.toString();

            if (body.length > 100000) {
                req.destroy();
            }
        });


        req.on("end", () => {

            try {

                const data =
                    new URLSearchParams(body);


                const contact = {

                    id:
                        crypto.randomUUID(),

                    name:
                        data.get("name") || "",

                    email:
                        data.get("email") || "",

                    message:
                        data.get("message") || "",

                    date:
                        new Date().toISOString()
                };


                const contacts =
                    ensureMessageIds(
                        readContacts()
                    );


                contacts.push(
                    contact
                );


                saveContacts(
                    contacts
                );


                console.log(
                    "Message Saved!"
                );

                console.log(
                    "ID:",
                    contact.id
                );

                console.log(
                    "Name:",
                    contact.name
                );

                console.log(
                    "Email:",
                    contact.email
                );

                console.log(
                    "Message:",
                    contact.message
                );


                sendJSON(
                    res,
                    200,
                    {
                        success: true,
                        message:
                            "Message saved successfully",
                        id:
                            contact.id
                    }
                );


            } catch (error) {

                console.error(
                    "Contact save error:",
                    error
                );


                sendJSON(
                    res,
                    500,
                    {
                        success: false,
                        message:
                            "Could not save message"
                    }
                );
            }
        });

        return;
    }


    // =========================
    // STATIC FILES
    // =========================

    let requestedPath =
        req.url.split("?")[0];


    if (requestedPath === "/") {
        requestedPath =
            "/index.html";
    }


    try {

        requestedPath =
            decodeURIComponent(
                requestedPath
            );

    } catch {

        res.writeHead(
            400,
            {
                "Content-Type":
                    "text/html; charset=utf-8"
            }
        );

        res.end(
            "<h1>400 - Bad Request</h1>"
        );

        return;
    }


    const projectRoot =
        path.resolve(
            __dirname
        );


    const filePath =
        path.resolve(
            __dirname,
            "." + requestedPath
        );


    // =========================
    // PATH SECURITY
    // =========================

    if (
        filePath !== projectRoot &&
        !filePath.startsWith(
            projectRoot + path.sep
        )
    ) {

        res.writeHead(
            403,
            {
                "Content-Type":
                    "text/html; charset=utf-8"
            }
        );

        res.end(
            "<h1>403 - Forbidden</h1>"
        );

        return;
    }


    // =========================
    // READ FILE
    // =========================

    fs.readFile(
        filePath,
        (error, content) => {

        if (error) {

            res.writeHead(
                404,
                {
                    "Content-Type":
                        "text/html; charset=utf-8"
                }
            );


            res.end(`
                <h1>404 - Page Not Found</h1>
                <p>The requested file does not exist.</p>
            `);

            return;
        }


        const extension =
            path.extname(
                filePath
            ).toLowerCase();


        const contentType =
            MIME_TYPES[extension] ||
            "application/octet-stream";


        res.writeHead(
            200,
            {
                "Content-Type":
                    contentType
            }
        );


        res.end(
            content
        );
    });
});


// =========================
// START SERVER
// =========================

server.listen(
    PORT,
    HOST,
    () => {

    console.log("");

    console.log(
        "===================================="
    );

    console.log(
        "   Muhammad Salman Portfolio"
    );

    console.log(
        "   Backend Server Started"
    );

    console.log(
        "===================================="
    );

    console.log("");

    console.log(
        `Website: http://${HOST}:${PORT}`
    );

    console.log(
        `Sign In: http://${HOST}:${PORT}/signin.html`
    );

    console.log(
        `Dashboard: http://${HOST}:${PORT}/dashboard.html`
    );

    console.log("");

    console.log(
        "Default Login:"
    );

    console.log(
        "Username: admin"
    );

    console.log(
        "Password: admin123"
    );

    console.log("");
});