# zipreport-cli

Electron cli to convert html to pdf, adapted from [Athena PDF](https://github.com/arachnys/athenapdf) and ideas from 
[Electron PDF](https://github.com/fraserxu/electron-pdf), under MIT license.

Its main purpose is to convert HTML reports to PDF. Keep in mind, using it to render external or untrusted pages can 
cause serious security issues.

### Differences from AthenaPDF cli
- Upgraded electron;
- Upgraded security flags (webSecurity=true, sandbox=true, enableRemoteModule=false);
- Additional options removed;
- Possibility of triggering rendering via JS event;
- Support for absolute paths on the output file;

### Differences from Electron PDF
- Upgraded electron;
- Upgraded security flags (webSecurity=true, sandbox=true, enableRemoteModule=false);
- CLI usage only for a single uri;
- Additional options removed;
- Simplified codebase; 
- JS event triggering is based on preload event handler instead of injected handler;
- JS event name is not customizable;

### Usage

```shell script
./zpt-cli <uri> <destination-file> [options] 
```

Notice: electron requires a framebuffer. On installations without a graphical environment, initialize one with xvfb:
```shell script
$ export DISPLAY=':99.0'
$ Xvfb :99 -screen 0 1024x768x24 > /dev/null 2>&1 &
```
 
### Command-line options

| Option | Default Value | Description |
|---|---|---|
|--timeout <seconds>| 30 | Time to wait before exiting application. After the specified time, application will exit unless --debug specified.|
|--delay <ms>|200| Delay (settling time) in millisseconds to generate PDF after page is ready. Ignored if --js-event specified. |
|--pagesize <size>|A4| Page size (A3/A4/A5/Legal/Letter/Tabloid). |
|--margins <type> |standard|Margin configuration to use (standard/none/minimal). |
|--zoom <factor>| 1| Zoom factor to use in rendering (1 represents 100%).|
|--proxy <url>| | Optional proxy server to use. |
|--no-insecure| | Disable execution of insecure content. |
|--no-background | | Disable rendering of CSS backgrounds.|
|--no-portrait | | Render in landscape.|
|--ignore-certificate-errors | | Ignore SSL certificate errors. |
|--ignore-gpu-blacklist | | Enables GPU in Docker environment. |
|--image| | Export to PNG instead of PDF |
|--width| 1024 | Window width in pixels for PNG export; Cannot be larger than framebuffer width.|
|--height| 768 | Window height in pixels for PNG export; Cannot be larger than framebuffer height.|
|--js-event| | Wait for a javascript event named 'zpt-view-ready'. |
|--js-timeout| 8| Seconds to wait for the javascript event. After the time has passed, the rendered is triggered regardless. |
|--security-opt <options>| | Optional security options to pass to Chromium|
|--no-sandbox| false| Disable Chromium sandbox (see below) |
|--no-gpu| false| Disable GPU acceleration |

### Using JS event trigger

To avoid generating the PDF before relevant in-page javascript has finished executing, it is possible for the page to
trigger the rendering only after an event is fired. To use this behaviour, do not forget to use
--js-event, and optionally --js-timeout \<milisseconds\> to specify how long to wait for the event (default is 8 seconds).

Sample event.html page:
```html
<html>
<head>
</head>
<body>
    <script>
        (function() {
            // trigger export event
            document.dispatchEvent(new Event('zpt-view-ready'));
        })()
    </script>
</body>
</html>
```
Running with event triggering:
```shell script
$ ./build/zpt-cli-linux-x64/zpt-cli test.html test.pdf --js-event
```

Output:
```
Received JS event
Converted 'file:///<path to your current directory>/test.html' to PDF: 'test.pdf'
Elapsed Time: 450.872ms
```

## Building

To build the zpt-cli binary in build/zpt-cli-\<arch\>/:

```shell script
npm install
npm run build
```

## Security Notes - disabling Chromium sandbox

Disabling the sandbox mode (--no-sandbox) may pose a serious security risk! Make sure you either trust any exernal web
content passed to zipreport-cli, or run zipreport-cli inside a locked down virtual machine. Make yourself confortable with
the (sandbox details)[https://chromium.googlesource.com/chromium/src/+/master/docs/design/sandbox_faq.md] so you can fully 
understand the possible attack vectors you will be exposed to when disabling the sandbox.


## Licensing

zipreport-cli code is provided under MIT License. Due to the derivative nature of the code, original authorship from AthenaPDF is also preserved. Please check required libraries for their own licensing terms.