//!#ifndef __INCLUDE_MANAGER_
//!#define __INCLUDE_MANAGER_

//!#include "util.js"
//!#include "indicator.js"
//!#include "note.js"

Components.utils.import("resource://floatnotes/URLHandler.jsm");


var locationBuilder = {
    buildLocationList: function(location, noteUrl) {
        var item;
        var group = document.getElementById('floatnotes-edit-location-list');
        util.removeChildren(group);
        
        this._addItem(group, 'This page',  URLHandler.getPageUrl(location), noteUrl);
        this._addItem(group, 'This page with query (including ?)',  URLHandler.getPageQueryUrl(location), noteUrl);
        this._addItem(group, 'This page with anchor (including #)',  URLHandler.getPageAnchorUrl(location), noteUrl);
        this._addItem(group, 'This website',  URLHandler.getSiteUrl(location), noteUrl);
        this._addItem(group, 'All websites (global)',  URLHandler.getAllSitesUrl(location), noteUrl);
        var moreOptions = document.createElement('label');
        moreOptions.setAttribute('value', 'On sites starting with...');
        moreOptions.style.cssText = 'color:blue;font-style:underline;';
        group.appendChild(moreOptions);


        var steps = URLHandler.getStartsWithUrls(location);
        for(var i = 0; i < steps.length; i++) {
            var step = steps[i];
            var text = step.substring(0, step.length-1);
            if(step.length > 60) {
                var parts = text.split('/');
                 text = parts[0] + '/';
                if(parts.length > 2) {
                    text += '(...)/';
                }
                var lastStep = parts[parts.length - 1];
                if(lastStep.length > 20) {
                    lastStep = lastStep.substr(0,15) + '(...)' + ((lastStep.lastIndexOf('.') > -1) ? lastStep.substr(lastStep.lastIndexOf('.')) : '');
                }
                text += lastStep;
            }
            this._addItem(group, text, step, noteUrl);
        }
    },
    _addItem: function(group, text, url, noteUrl) {
        var item = group.appendItem(text, url);
        item.disabled = !url;
        if(noteUrl == url) {  
            group.selectedItem = item;
        }
        return item;
    }
};



function FloatNotesView(manager) {
    this.notesManager = manager;  
    this.status = {};
    this.notes = {};

    // get references to menu items
    this._deleteMenuEntry = document.getElementById('floatnotes-delete-note');
    this._locationsMenu = document.getElementById('floatnotes-edit-note');
    this._editMenuEntry = document.getElementById('floatnotes-edit-note');
    this._hideMenuEntry = document.getElementById('floatnotes-hide-note');
    this._newMenuEntry = document.getElementById('floatnotes-new-note');
    this.popup = document.getElementById('floatnotes-edit-popup');
    // create indicators
    IndicatorProxy.init(this);

    this.doObserve = true;
    this.registerEventHandlers();
    this.registerObserver();
}
FloatNotesView.GLOBAL_NAME = 'gFloatNotesView';

FloatNotesView.prototype = {

    /* getter and setter */

    get _container() {
        var container_id = 'floatnotes-container';
        var container = this.currentDocument.getElementById(container_id);
        if(!container && this.currentDocument && this.currentDocument.body) {
            container = this.currentDocument.createElement('div');
            container.id = container_id;
            this.currentDocument.body.appendChild(container);
        }
        return container;
    },
    set _container(value) {},

    /* end getter and setter */

    registerEventHandlers: function() {
        // attach load handler
        var that = this; 
        gBrowser.addEventListener("DOMContentLoaded", function(e){that.onPageLoad(e);}, true);
        var container = gBrowser.tabContainer;
        container.addEventListener("TabSelect", function(e){that.onTabSelect(e);}, false);
        window.addEventListener("contextmenu", function(e) {that.updateContext(e);}, true);
        window.addEventListener("contextmenu", function(e) {that.updateContextMenu(e);}, false);
    },

    registerObserver: function() {
        var obsService = Components.classes["@mozilla.org/observer-service;1"]
        .getService(Components.interfaces.nsIObserverService);
        obsService.addObserver(this, 'floatnotes-note-update', false);
        obsService.addObserver(this, 'floatnotes-note-delete', false);
        obsService.addObserver(this, 'floatnotes-note-urlchange', false);
        obsService.addObserver(this, 'floatnotes-note-add', false);
        //var that = this;
        //function remove() {
        //that.removeObserver();
        //}
        //window.addEventListener('unload',remove , true);
        //this._removeUnloadListener = function() { window.removeEventListener('unload', remove, true);};
    },

    removeObserver: function() {
        //this._removeUnloadListener();
        var obsService = Components.classes["@mozilla.org/observer-service;1"]
        .getService(Components.interfaces.nsIObserverService);
        obsService.removeObserver(this, 'floatnotes-note-update');
        obsService.removeObserver(this, 'floatnotes-note-delete');
    },

    observe: function(subject, topic, data) {  
        if(this.doObserve) { LOG('Notification received: ' + topic + ' Data: ' + data);
            switch(topic) {
                case 'floatnotes-note-update':
                    if(this.notes[data]) {
                        this.notes[data].update();
                    }
                break;
                case 'floatnotes-note-delete':
                    if(this.notes[data]) {
                        this.notes[data].detach();
                        delete this.notes[data];
                    }
                break;
                case 'floatnotes-note-urlchange':
                    var note = this.notes[data];
                    LOG('URL changed for: ' + data);
                    if(note) {
                        note.detach();
                    }
                case 'floatnotes-note-add':
                    var locations =  URLHandler.getSearchUrls(this.currentDocument.location);
                    var note = this.notes[data] || this._createNotesWith([this.notesManager.notes[data]])[0];
                    if (locations.indexOf(note.data.url) > -1) {
                        this._attachNotesToCurrentDocument([note]);
                    }
            }
        }
    },

    onPageLoad: function (event) {
        this.updatePreferences();  
        var win = event.originalTarget.defaultView;
        var doc = win.document; // doc is document that triggered "onload" event                       
        var isFocusedDocument = (doc === gBrowser.contentDocument); 
        if(isFocusedDocument) {
            this.currentDocument = doc;
            this.loadNotes();
        }
    },

    updatePreferences: function() {
        this._scrolltimeout = util.getPreferencesService().getIntPref('scrolltimer');
        this.indicator_timeout = util.getPreferencesService().getIntPref('fadeOutAfter');
        this.show_indicators = util.getPreferencesService().getBoolPref('showIndicator');
    },

    /**
       * Load and/or show notes
*/
    onTabSelect: function(e) {
        this.currentDocument = gBrowser.contentDocument;
        this.loadNotes();
    },

    /**
       * Load and attach the notes
*/
    loadNotes: function(doc) {
        doc = doc || this.currentDocument;
        var that = this;
        this.notesManager.getNotesFor(doc.location, function(data) {
            LOG('Notes loaded for ' + doc.location + ': ' + data.length);
            that.currentNotes = that._createNotesWith(data);
            that._attachNotesToCurrentDocument();
            that._attachAndShowIndicators();
            if(doc.location.hash && doc.location.hash.indexOf('#floatnotes-note') === 0) {
                doc.location.hash = doc.location.hash;
            }
        });
    },

    _createNotesWith: function(dataSet) {
        var notes = [];
        for(var i = dataSet.length -1; i > -1; --i) {
            var data = dataSet[i];
            if(!this.notes[data.guid]) {
                this.notes[data.guid] = new FloatNote(data, this); LOG('Created first time: ' + data.guid);
            }
            notes.push(this.notes[data.guid]);
        }
        return notes;
    },

    _attachNotesToCurrentDocument: function(notes) {
        var doc = this.currentDocument;
        var container = this._container;
        notes = notes || this.currentNotes;
        for (var i = 0, length = notes.length; i < length; ++i) {
            notes[i].attachToDocument(doc, container);	
        }
    },


    _attachAndShowIndicators: function() {
        if(this.show_indicators) {
            IndicatorProxy.attachTo(this.currentDocument, this._container);
            this._attachScrollHandlerTo(this.currentDocument);
            util.fireEvent(this.currentDocument, 'scroll');
        }	 
    },

    _startScrollTimeout: function() {
        var that = this;
        this._stopScrollTimeout();
        this._scrolltimer = window.setTimeout(function(){
            that._updateAndShowIndicators();
        }, this._scrolltimeout);
    },

    _stopScrollTimeout: function() {
        if(this._scrolltimer) {
            window.clearTimeout(this._scrolltimer);
            this._scrolltimer = null;
        }
    },

    _updateAndShowIndicators: function() {
        this._updateNotePositions();
        IndicatorProxy.updateAndShow(this.currentDocument, this.currentNotes);
        IndicatorProxy.startTimeout();
    },

    _updateNotePositions: function() {
        var doc = this.currentDocument;
        var wintop = parseInt(doc.defaultView.pageYOffset, 10),
        winheight = parseInt(doc.defaultView.innerHeight, 10);

        this.currentNotes.forEach(function(note) {
            if(note.dom) {
                var element = note.dom;
                var top = parseInt(element.style.top, 10);
                var bottom = top + parseInt(element.offsetHeight, 10);
                if (wintop > bottom) {
                    note.position = Indicator.ABOVE;
                }
                else if(wintop + winheight < top) {
                    note.position = Indicator.BELOW;
                }
                else {
                    note.position = 0;
                }
            }

        });

    }, 

    _attachScrollHandlerTo: function(doc) {
        var that = this;
        this._removeScrollHandler();

        function handler() {
             that._startScrollTimeout();
        }

        doc.addEventListener('scroll', handler, false);

        this._killScrollHandler = function() {
            doc.removeEventListener('scroll', handler, false);
            that._killScrollHandler = null;
        };
    },

    _removeScrollHandler: function() {
        if(this._killScrollHandler) {
            this._killScrollHandler();
            this._killScrollHandler = null;
        }
    },

    addNote: function() {
        var data = this.notesManager.createNote(this.currentDocument);
        data.x = this.X;
        data.y = this.Y;
        var note = new FloatNote(data, this);
        note.attachToDocument(this.currentDocument, this._container);
        this._attachAndShowIndicators();
        note.edit();
    },

    saveNote: function(note, cb) {
        this.doObserve = false;
        var that = this;
        this.notesManager.saveNote(note.data, function(id, guid) {
            if(guid) {
                that.notes[guid] = note;
            }
            that.doObserve = true;
            cb(id, guid);
        });
    },

    deleteNote: function(note) {
        note = note || this.contextNote
        if(note) {
            var that = this;
            this.doObserve = false;
            this.notesManager.deleteNote(note.data, function() {
                note.detach();
                delete that.notes[note.data.guid];
                that.contextNote = null;
                that.doObserve = true;
            }); 
        }
    },

    /* show or hide the notes for the current location */
    toggleNotes: function() {
        var domain = this.currentDocument.location;
        if(this._notesHiddenFor(domain)) {
            this.showNotes(); LOG('Nodes shown.');
        }
        else {
            this.hideNotes(); LOG('Nodes hidden.');
        }
    },

    showNotes: function() {
        var location = this.currentDocument.location;
        this._setNotesVisibilityForTo(location, true);
        util.show(this._container);
        this._attachAndShowIndicators();
        this._updateMenuText(false);

    },

    hideNotes: function() {
        var location = this.currentDocument.location;
        this._setNotesVisibilityForTo(location, false);
        util.hide(this._container);
        this._detachIndicators();
        this._updateMenuText(true);
    },

    _setNotesVisibilityForTo: function(location, visible) {
        if(!this.status[location]) {
            this.status[location] = {};
        }
        this.status[location].visible = visible;
    }, 

    _detachIndicators: function() {
        this._removeScrollHandler();
        //IndicatorProxy.detach();
    },

    updateContext: function(event) {
        this.contextNote = null;
        this.X = event.pageX;
        this.Y = event.pageY;
    },

    updateContextMenu: function(event) {
        if(this.contextNote) {
            // don't show any menu items if in editing mode
            var showOrHide = (this.contextNote.hasStatus(note_status.EDITING) ? this._hideMenuItems : this._showMenuItems);
            showOrHide([this._deleteMenuEntry, this._editMenuEntry]);
            this._hideMenuItems([this._newMenuEntry]);
        }
        else {
            this._hideMenuItems([this._deleteMenuEntry, this._editMenuEntry]);
            this._showMenuItems([this._newMenuEntry]);
        }
        var doc = this.currentDocument || gBrowser.contentDocument;
        var domain = doc.location;
        if(this.notesManager.siteHasNotes(domain) && !this.contextNote) {
            this._showMenuItems([this._hideMenuEntry]); 
            this._updateMenuText(this._notesHiddenFor(domain));
        }
        else {
            this._hideMenuItems([this._hideMenuEntry]);
        }
    },

    _hideMenuItems: function(items) {
        for(var i = 0, l = items.length; i < l; i++) {
            items[i].hidden = true;
        }
    },

    _showMenuItems: function(items) {
        for(var i = 0, l = items.length; i < l; i++) {
            items[i].hidden = false;
        }
    },

    _notesHiddenFor: function(location) {
        return this.status[location] && !this.status[location].visible;
    },

    openEditPopup: function(note, anchor, cb) {
        this.popup.hidePopup();
        locationBuilder.buildLocationList(this.currentDocument.location, note.url);
        document.getElementById('floatnotes-edit-color').color = note.color;
        this.saveChanges = function() {
            if(this.popup.state == 'closed') {
                LOG('Edit popup hidden');
                cb(document.getElementById('floatnotes-edit-color').color,document.getElementById('floatnotes-edit-location-list').selectedItem.value);
            }
        };
        this.popup.openPopup(anchor, "end_before", 0, 0, false, false); 
    },

    updateMenuLocations: function() {
        var locations = util.getLocations(this.currentDocument.location);
        for(var i = 0, l = locations.length; i < l; i++) {
            var location = locations[i];
            var item = this._locationsMenu.appendItem(location, location);
            item.setAttribute('type','radio');
            item.setAttribute('name', 'floatnotes-menu-location');
            item.setAttribute('checked', (this.contextNote.data.url == location));
            item.setAttribute('oncommand', FloatNotesView.GLOBAL_NAME + ".contextNote.updateLocation(this.value);");
        }
    },

    removeMenuLocations: function() {
        for(var i  = this._locationsMenu.itemCount-1; i >= 0; i--) {
            this._locationsMenu.removeItemAt(i);
        }
    },

    _updateMenuText: function(hide) { 
        if(!hide) {
            this._hideMenuEntry.setAttribute('label', util.getString('hideNotesString'));
            this._hideMenuEntry.setAttribute('image', 'chrome://floatnotes/skin/hide_note_small.png');
        }
            else {
                this._hideMenuEntry.setAttribute('label', util.getString('showNotesString', [this.currentNotes.length]));
                this._hideMenuEntry.setAttribute('image', 'chrome://floatnotes/skin/unhide_note_small.png');
            }
    }
};

//!#endif
