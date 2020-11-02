"use strict";

const fs = require("fs");
const path = require("path");
const url = require("url");

const zpt = require("commander");
const electron = require("electron");
const {app, ipcMain} = electron;
const BrowserWindow = electron.BrowserWindow;


const TIMED_LABEL = "Elapsed Time"          // Label for execution profiling
const PAGE_TIMEOUT_SECONDS = 60             // Max wait time - after this application will exit (unless in debug mode)
const SAVE_DELAY = 0.2 * 1000               // Settling time before saving a page, if not using js events
const EVENT_WAIT_TIMEOUT = 8                // Max wait time for a custom JS event (seconds)
const IPC_CHANNEL = 'ZPT_VIEW_READY'        // Channel to use to receive js event notifications
const DEFAULT_JS_EVENT = 'zpt-view-ready'   // Default JS event name
const DEFAULT_WIDTH = 1024
const DEFAULT_HEIGHT = 768

var bw = null;
var ses = null;
var uriArg = null;
var outputArg = null;

// Enum for Electron's marginType codes
const MarginTypes = {
    "standard": 0,
    "none": 1,
    "minimal": 2,
};

function filterUri(uri) {
    if (!uri.toLowerCase().startsWith("http") && !uri.toLowerCase().startsWith("chrome://")) {
        uri = url.format({
            protocol: "file",
            pathname: path.resolve(uri),
            slashes: true
        });
    }
    return uri;
}

function processAppOptions(opts) {
    // chrome crashes in docker, more info: https://github.com/GoogleChrome/puppeteer/issues/1834
    app.commandLine.appendArgument("disable-dev-shm-usage");

    if (opts.securityOpt) {
        app.commandLine.appendSwitch("--security-opt", opts.securityOpt);
    }
    if (opts.proxy) {
        app.commandLine.appendSwitch("proxy-server", opts.proxy);
    }
    if (opts.ignoreCertificateErrors) {
        app.commandLine.appendSwitch("ignore-certificate-errors");
    }
    app.commandLine.appendSwitch('ignore-gpu-blacklist', opts.ignoreGpuBlacklist || "false");
}

function buildPdfOptions(opts) {
    return {
        pageSize: opts.pagesize,
        marginsType: MarginTypes[opts.margins],
        printBackground: opts.background,
        landscape: !opts.portrait
    };
}

function buildBrowserWindow(opts) {
    var bwOpts = {
        show: (opts.debug || false),
        width: opts.width || DEFAULT_WIDTH,
        height: opts.height || DEFAULT_HEIGHT,
        webPreferences: {
            nodeIntegration: false,
            webSecurity: true,
            sandbox: !opts.noSandbox,
            enableRemoteModule: false, // prototype leaking
            allowRunningInsecureContent: !opts.insecure, // allow unsafe css/js
            zoomFactor: (opts.zoom || 1),
            contextIsolation: true,
        }
    };

    if (opts.jsEvent) {
        const preload = path.resolve(__dirname, 'preload.js')
        fs.access(preload, (err) => {
            if (err) {
                console.error("Cannot locate preload script")
                app.exit(1)
            }
            });
        // add preload script for js event
        bwOpts['webPreferences']["preload"] = preload
    }

    if (process.platform === "linux") {
        bwOpts["webPreferences"]["defaultFontFamily"] = {
            standard: "Liberation Serif",
            serif: "Liberation Serif",
            sansSerif: "Liberation Sans",
            monospace: "Liberation Mono"
        };
    }

    return new BrowserWindow(bwOpts);
}

if (!process.defaultApp) {
    process.argv.unshift("--");
}

zpt
    .version("0.9.2")
    .description("Render HTML to to PDF")
    .option("--debug", "show GUI", false)
    .option("-T, --timeout <seconds>", "seconds before timing out (default: 60)", parseInt)
    .option("-D, --delay <milliseconds>", "milliseconds delay before saving (default: 200)", parseInt)
    .option("-P, --pagesize <size>", "page size of the generated PDF (default: A4)", /^(A3|A4|A5|Legal|Letter|Tabloid)$/i, "A4")
    .option("-M, --margins <marginsType>", "margins to use when generating the PDF (default: standard)", /^(standard|none|minimal)$/i, "standard")
    .option("-Z --zoom <factor>", "zoom factor for higher scale rendering (default: 1 - represents 100%)", parseInt)
    .option("--proxy <url>", "use proxy to load remote HTML")
    .option("--image", "Export to PNG instead of PDF")
    .option("--width <pixels>", "Window width in pixels (default 1024)", parseInt)
    .option("--height <pixels>", "Window height in pixels (default 768)", parseInt)
    .option("--no-background", "omit CSS backgrounds")
    .option("--no-portrait", "render in landscape")
    .option("--no-insecure", "do not allow insecure content")
    .option("--ignore-certificate-errors", "ignores certificate errors")
    .option("--ignore-gpu-blacklist", "Enables GPU in Docker environment")
    .option("--js-event", "Wait for a js event (zpt-view-ready)")
    .option("--js-timeout <timeout>", "Timeout when waiting for event (default 8 seconds)", parseInt)
    .option("--security-opt <options>", "Set chromium security options")
    .option("--no-sandbox", "Disable chromium sanbox (dangerous! see README")
    .arguments("<URI> <output>")
    .action((uri, output) => {
        if (!uri) {
            console.error("No URI given");
            process.exit(1);
        }
        if (!output) {
            console.error("No URI given");
            process.exit(1);
        }
        uriArg = filterUri(uri);
        outputArg = output;
    })
    .parse(process.argv);

processAppOptions(zpt);

const _finish = () => {
    console.timeEnd(TIMED_LABEL);
    zpt.debug || app.quit();
}

if (!zpt.debug) {
    setTimeout(() => {
        console.error("PDF generation timed out.");
        app.exit(2);
    }, (zpt.timeout || PAGE_TIMEOUT_SECONDS) * 1000);
}

app.on("ready", () => {

    console.time(TIMED_LABEL);
    bw = buildBrowserWindow(zpt);

    const _exportFile = () => {
        if (zpt.image) {
            // if image, export PNG
            bw.webContents.capturePage().then(image => {
                const pngBuffer = image.toPNG()
                const target = path.resolve(outputArg)
                fs.writeFile(target, pngBuffer, function (err) {
                    if (err) {
                        console.error(err);
                    } else {
                        console.info(`Converted '${uriArg}' to PNG: '${outputArg}'`);
                    }
                    _finish();
                });
            });
            return
        }

        // Export PDF
        bw.webContents.printToPDF(buildPdfOptions(zpt)).then((data, err) => {
            if (err) {
                console.error(err);
                _finish();
            }

            const outputPath = path.resolve(outputArg);
            fs.writeFile(outputPath, data, (err) => {
                if (err) {
                    console.error(err);
                } else {
                    console.info(`Converted '${uriArg}' to PDF: '${outputArg}'`);
                }
                _finish();
            });
        });
    };

    bw.webContents.on("did-fail-load", (e, code, desc, url, isMainFrame) => {
        if (parseInt(code, 10) >= -3) return;
        console.error(`Failed to load: ${code} ${desc} (${url})`);
        if (isMainFrame) {
            app.exit(1);
        }
    });

    bw.webContents.on("did-navigate", (e, newURL, httpResponseCode, httpResponseText) => {
        if (httpResponseCode >= 400) {
            console.error(`Failed to load ${newURL} - got HTTP code ${httpResponseCode}`);
            app.exit(1);
        }
    });

    bw.webContents.on("render-process-gone", () => {
        console.error(`The renderer process has crashed.`);
        app.exit(1);
    });

    if (zpt.jsEvent) {
        let printed = false

        const ipcListener = (name, jobId, customEventDetail) => {
            console.info('Received JS event');
            ipcMain.removeListener(IPC_CHANNEL, ipcListener);
            clearTimeout(jsTimeout);
            if (!printed) {
                printed = true;
                _exportFile();
            }
        }

        const ipcTimeout = (listener) => {
            console.warn("Timeout waiting for JS event, exporting anyway...")
            ipcMain.removeListener(IPC_CHANNEL, listener);
            if (!printed) {
                printed = true;
                _exportFile();
            }
        }
        // listen for DEFAULT_JS_EVENT
        ipcMain.on(IPC_CHANNEL, ipcListener);

        // set timeout trigger
        const jsTimeout = setTimeout(() => {
            ipcTimeout(ipcListener);
            clearTimeout(jsTimeout);
        }, (zpt.jsTimeout || EVENT_WAIT_TIMEOUT) * 1000)

    } else {
        // No JS event, just process settling time
        bw.webContents.on("did-finish-load", () => {
            setTimeout(_exportFile, zpt.delay || SAVE_DELAY);
        });
    }

    // Start window
    bw.loadURL(uriArg);
    ses = bw.webContents.session;
    ses.on("will-download", (e, item, webContents) => {
        e.preventDefault();
        console.error('Unable to convert an octet-stream.');
        app.exit(1);
    });

});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
