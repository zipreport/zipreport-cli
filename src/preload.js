document.addEventListener('zpt-view-ready',
    function (event) {
        const {ipcRenderer} = require('electron');
        ipcRenderer.send('ZPT_VIEW_READY', event.description);
    });
