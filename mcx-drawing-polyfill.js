/*!
 * Google Maps Drawing Manager Polyfill
 * * A zero-dependency, drop-in replacement for the deprecated google.maps.drawing library.
 * * Author: Robert McMahon
 * * Update: Mauriat Miranda
 * Website: https://www.mapchannels.com/ 
 * GitHub: https://github.com/mapchannels/google-maps-drawing-polyfill
 * Demo: https://mapchannels.github.io/mcx-drawing-polyfill/demo.html
 * Update: https://github.com/mauriat/mcx-drawing-polyfill
 * * Released under the MIT License.
 * Copyright (c) 2026 Map Channels
 * Copyright (c) 2026 Mauriat Miranda
 * * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction... (see GitHub repo for full license).
 */

(function ()
{
    'use strict';

    // Guard: only inject if the native library is absent
    window.google = window.google || {};
    window.google.maps = window.google.maps || {};

    if (window.google.maps.drawing)
    {
        return; // Native library present — do nothing
    }

    // ── CSS Injection ──────────────────────────────────────

    const TOOLBAR_CSS = [
        '.mcx-draw-toolbar {',
        '  display: flex;',
        '  align-items: center;',
        '  background: #fff;',
        '  border-radius: 2px;',
        '  box-shadow: rgba(0,0,0,0.3) 0 1px 4px -1px;',
        '  margin: 10px;',
        '  overflow: hidden;',
        '}',
        '.mcx-draw-btn {',
        '  width: 40px;',
        '  height: 40px;',
        '  display: flex;',
        '  align-items: center;',
        '  justify-content: center;',
        '  cursor: pointer;',
        '  border: none;',
        '  background: #fff;',
        '  border-right: 1px solid #e0e0e0;',
        '  padding: 0;',
        '  transition: background 0.15s;',
        '  flex-shrink: 0;',
        '}',
        '.mcx-draw-btn:last-child { border-right: none; }',
        '.mcx-draw-btn:hover { background: #f5f5f5; }',
        '.mcx-draw-btn.mcx-draw-active {',
        '  background: #e8e8e8;',
        '  box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);',
        '}',
        '.mcx-draw-btn svg { pointer-events: none; }',
    ].join('\n');

    let _stylesInjected = false;
    function _injectStyles()
    {
        if (_stylesInjected) return;
        const style = document.createElement('style');
        style.id = 'mcx-drawing-polyfill-css';
        style.textContent = TOOLBAR_CSS;
        document.head.appendChild(style);
        _stylesInjected = true;
    }

    // ── SVG Icons ──────────────────────────────────────────

    const ICONS = {
        hand: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M6 14a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4v-2.5a.5.5 0 0 0-.5-.5H6.5a.5.5 0 0 0-.5.5V14z"/></svg>',
        marker: '<svg width="18" height="18" viewBox="0 0 24 24" fill="#555" stroke="#555" stroke-width="0"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>',
        circle: '<svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(85,85,85,0.15)" stroke="#555" stroke-width="2" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg>',
        polyline: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,17 9,7 15,13 21,5"/></svg>',
        polygon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(85,85,85,0.15)" stroke="#555" stroke-width="2" stroke-linejoin="round"><polygon points="12,3 21,9 18,20 6,20 3,9"/></svg>',
        rectangle: '<svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(85,85,85,0.15)" stroke="#555" stroke-width="2" stroke-linejoin="round"><polygon points="3,3 21,3 21,21 3,21"/></svg>',
    };

    // ── OverlayType enum ───────────────────────────────────

    const OverlayType = {
        CIRCLE: 'circle',
        MARKER: 'marker',
        POLYGON: 'polygon',
        POLYLINE: 'polyline',
        RECTANGLE: 'rectangle',
    };

    // ── DrawingManager Class ───────────────────────────────

    const DrawingManager = (function ()
    {

        function DrawingManager(options)
        {
            options = options || {};

            this._map = null;
            this._currentMode = options.drawingMode || null;
            this._options = options;

            // In-progress drawing state
            this._coords = [];         // accumulated coordinates
            this._activeShape = null;  // primary google.maps.Polyline being drawn (even for polygons!)
            this._ghostLine = null;    // dashed preview line to cursor
            this._finishingMarker = null; // The interactive node to close/finish shapes

            // Map event listener handles (for cleanup)
            this._listeners = [];

            // Toolbar DOM reference
            this._toolbar = null;
            this._btnElements = {};    // mode → button element

            // Bind stable handler references
            this._onMapClick = this._handleMapClick.bind(this);
            this._onMouseMove = this._handleMouseMove.bind(this);
            this._onMouseDblClick = this._handleFinishingNodeClick.bind(this);
            this._onFinishingNodeClick = this._handleFinishingNodeClick.bind(this);

            // Attach to map if provided
            if (options.map)
            {
                this.setMap(options.map);
            }
        }

        // ── Public API ─────────────────────────────────────

        DrawingManager.prototype.setMap = function (map)
        {
            if (this._map === map) return;

            // Detach from old map
            if (this._map)
            {
                this._detachFromMap();
            }

            this._map = map;

            if (map)
            {
                this._attachToMap();
                if (this._options.drawingControl !== false)
                {
                    this._buildToolbar();
                }
            }
        };

        DrawingManager.prototype.getMap = () => this._map;

        DrawingManager.prototype.setDrawingMode = function (mode)
        {
            this._cancelCurrentDraw();
            this._currentMode = mode;
            this._updateCursor();
            this._updateToolbarState();
        };

        DrawingManager.prototype.getDrawingMode = () => this._currentMode;

        // ── Map attachment / detachment ────────────────────

        DrawingManager.prototype._attachToMap = function ()
        {
            const self = this;
            const clickHandle = google.maps.event.addListener(this._map, 'click', self._onMapClick);
            const moveHandle = google.maps.event.addListener(this._map, 'mousemove', self._onMouseMove);
            const dblClickHandle = google.maps.event.addListener(this._map, 'dblclick', self._onMouseDblClick);

            this._listeners = [clickHandle, moveHandle, dblClickHandle];
            this._updateCursor();
        };

        DrawingManager.prototype._detachFromMap = function ()
        {
            this._listeners.forEach(function (l)
            {
                google.maps.event.removeListener(l);
            });
            this._listeners = [];
            this._destroyActiveShapes();

            if (this._finishingMarker)
            {
                this._finishingMarker.setMap(null);
                this._finishingMarker = null;
            }

            this._coords = [];

            if (this._toolbar && this._toolbar.parentElement)
            {
                this._toolbar.parentElement.removeChild(this._toolbar);
                this._toolbar = null;
            }
        };

        // ── Map event handlers ─────────────────────────────

        DrawingManager.prototype._handleMapClick = function (e)
        {
            if (!this._currentMode) return;
            if (!e.latLng) return;

            if (this._currentMode === OverlayType.MARKER)
            {
                this._finishMarker(e.latLng);
                return;
            } else
            {
                this._coords.push(e.latLng);

                if (this._coords.length === 1)
                {
                    this._initActiveShape();
                } else
                {
                    this._updateActiveShape();

                    // Circle and Rectangle only require 2 clicks, second click should finish
                    if (this._currentMode === OverlayType.CIRCLE || this._currentMode === OverlayType.RECTANGLE)
                    {
                        this._handleFinishingNodeClick(e);
                        return;
                    }
                }

                this._updateFinishingNode();
                this._updateGhostLine(e.latLng);
            }
        };

        DrawingManager.prototype._handleMouseMove = function (e)
        {
            if (!this._currentMode) return;
            if (!e.latLng) return;

            if (this._coords.length > 0 && this._currentMode !== OverlayType.MARKER)
            {
                this._updateGhostLine(e.latLng);
            }
        };

        DrawingManager.prototype._handleFinishingNodeClick = function ()
        {
            const self = this;
            if (this._currentMode) {
                this._tempDisableGestures();
            }
            if (!this._currentMode) return;

            const minPoints = (this._currentMode === OverlayType.POLYGON) ? 3 : 2;
            if (this._coords.length >= minPoints)
            {
                this._finishShape(this._currentMode);
            }
        };

        // ── Shape lifecycle ────────────────────────────────

        DrawingManager.prototype._initActiveShape = function ()
        {
            if (this._currentMode === OverlayType.CIRCLE)
            {
                this._activeShape = new google.maps.Circle({
                    center: this._coords[0],
                    map: this._map,
                    strokeColor: '#1a73e8',
                    strokeWeight: 2,
                    strokeOpacity: 0.9,
                    fillColor: '#1a73e8',
                    fillOpacity: 0.25,
                    clickable: false,
                    zIndex: 200
                });
            } else if (this._currentMode === OverlayType.RECTANGLE)
            {
                // Default rectangle is just a point at coord 0
                this._activeShape = new google.maps.Rectangle({
                    bounds: new google.maps.LatLngBounds(this._coords[0], this._coords[0]),
                    map: this._map,
                    strokeColor: '#1a73e8',
                    strokeWeight: 2,
                    strokeOpacity: 0.9,
                    fillColor: '#1a73e8',
                    fillOpacity: 0.25,
                    clickable: false,
                    zIndex: 200
                });
            } else { // POLYLINE, POLYGON
                this._activeShape = new google.maps.Polyline({
                    path: this._coords,
                    map: this._map,
                    strokeColor: '#1a73e8',
                    strokeWeight: 3,
                    strokeOpacity: 0.9,
                    // FIX: Force Google Maps SVG renderer to use round joints instead of square caps.
                    // This completely eliminates sharp overlapping corners/horns on acute angles.
                    strokeLineJoin: 'round',
                    strokeLineCap: 'round',
                    clickable: false,
                    zIndex: 200
                });
            }
        };

        DrawingManager.prototype._updateActiveShape = function ()
        {
            if (!this._activeShape) return;
            if (this._currentMode === OverlayType.CIRCLE)
            {
                this._activeShape.setRadius(this._getRadiusMeters(this._coords[0], this._coords[1]));
            } else if (this._currentMode === OverlayType.RECTANGLE)
            {
                this._activeShape.setBounds(this._getRectBounds(this._coords[0], this._coords[1]));
            } else {
                this._activeShape.setPath(this._coords);
            }
        };

        DrawingManager.prototype._updateGhostLine = function (cursorLatLng)
        {
            const lastCoord = this._coords[this._coords.length - 1];
            if (!lastCoord) return;

            // FIX: If the mouse hasn't moved from the exact spot you clicked,
            // hide the ghost line. A zero-length line has no angle, which causes 
            // the Google Maps renderer to draw a crooked "spike" artifact!
            if (lastCoord.equals(cursorLatLng) &&
                (this._currentMode !== OverlayType.CIRCLE && this._currentMode !== OverlayType.RECTANGLE))
            {
                if (this._ghostLine) this._ghostLine.setVisible(false);
                return;
            }

            const ghostPath = [lastCoord, cursorLatLng];

            if (!this._ghostLine)
            {
                if (this._currentMode === OverlayType.CIRCLE)
                {
                    this._ghostLine = new google.maps.Circle({
                        center: this._coords[0], cursorLatLng,
                        radius: this._getRadiusMeters(this._coords[0], cursorLatLng),
                        map: this._map,
                        strokeColor: '#1a73e8',
                        strokeWeight: 2,
                        strokeOpacity: 0.9,
                        fillColor: '#1a73e8',
                        fillOpacity: 0.25,
                        clickable: false,
                        zIndex: 201,
                    });
                } else if (this._currentMode === OverlayType.RECTANGLE)
                {
                    this._ghostLine = new google.maps.Rectangle({
                        bounds: this._getRectBounds(this._coords[0], cursorLatLng),
                        map: this._map,
                        strokeColor: '#1a73e8',
                        strokeWeight: 2,
                        strokeOpacity: 0.9,
                        fillColor: '#1a73e8',
                        fillOpacity: 0.25,
                        clickable: false,
                        zIndex: 201,
                    });
                } else
                {
                    this._ghostLine = new google.maps.Polyline({
                        path: ghostPath,
                        map: this._map,
                        strokeOpacity: 0, // The main solid stroke must be hidden for dots to work
                        icons: [{
                            icon: {
                                // FIX: Changed from a dashed line to a dotted line as requested
                                path: google.maps.SymbolPath.CIRCLE,
                                fillColor: '#1a73e8',
                                fillOpacity: 0.7,
                                strokeOpacity: 0,
                                scale: 2
                            },
                            offset: '0',
                            repeat: '4px'
                        }],
                        clickable: false,
                        zIndex: 201
                    });
                }
            } else
            {
                if (this._currentMode === OverlayType.CIRCLE)
                {
                    this._ghostLine.setRadius(this._getRadiusMeters(this._coords[0], cursorLatLng));
                } else if (this._currentMode === OverlayType.RECTANGLE)
                {
                    this._ghostLine.setBounds(this._getRectBounds(this._coords[0], cursorLatLng));
                } else {
                    this._ghostLine.setPath(ghostPath);
                    this._ghostLine.setVisible(true); // Bring it back once the mouse moves
                }
            }
        };

        DrawingManager.prototype._updateFinishingNode = function () 
        {
            const coords = this._coords;
            const self = this;

            if (
                coords.length === 0 ||
                ((this._currentMode === OverlayType.POLYLINE || this._currentMode === OverlayType.POLYGON) && coords.length < 2)
            )
            {
                if (this._finishingMarker) this._finishMarker.map = null;
                return;
            }

            if (!this._finishingMarker) 
            {
                const svgString = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
                    <circle cx="50%" cy="50%" r="10" fill="rgba(255, 255, 255, 0.9)" stroke="#4285F4" stroke-width="4"/>
                    </svg>`;
                const markerSvg = (new DOMParser()).parseFromString(svgString, "image/svg+xml").documentElement;
                markerSvg.style.transform = "translateY(66.6%)";
                this._finishingMarker = new google.maps.marker.AdvancedMarkerElement({
                    map: this._map,
                    content: markerSvg,
                    zIndex: 300,
                });

                google.maps.event.addListener(this._finishingMarker, 'click', function (e)
                {
                    if (e.domEvent)
                    {
                        e.domEvent.preventDefault();
                        e.domEvent.stopPropagation();
                    }
                    self._onFinishingNodeClick();
                });
            }

            if (this._currentMode === OverlayType.POLYLINE)
            {
                // For Polylines, the finishing node lives on the LAST clicked point
                this._finishingMarker.position = coords[coords.length - 1];
            }
            else if (this._currentMode === OverlayType.POLYGON)
            {
                // For Polygons, the finishing node lives on the FIRST point to close the shape.
                this._finishingMarker.position = coords[0];
            }
        };

        DrawingManager.prototype._destroyActiveShapes = function ()
        {
            if (this._ghostLine)
            {
                this._ghostLine.setMap(null);
                this._ghostLine = null;
            }
            if (this._activeShape)
            {
                this._activeShape.setMap(null);
                this._activeShape = null;
            }
        };

        DrawingManager.prototype._cancelCurrentDraw = function ()
        {
            this._destroyActiveShapes();
            if (this._finishingMarker)
            {
                this._finishMarker.map = null;
            }
            this._coords = [];
            // The 'Pan' hand active is equivalent to 'null'
            this._currentMode = null;
        };

        // ── Finish handlers ────────────────────────────────

        DrawingManager.prototype._finishMarker = function (latLng)
        {
            this._tempDisableGestures();

            const markerOptions = {
                ...(this._options.markerOptions || {}),
                position: latLng,
                map: this._map,
            };
            const mockMarker = new google.maps.marker.AdvancedMarkerElement(markerOptions);

            const self = this;
            google.maps.event.trigger(self, 'overlaycomplete', {
                type: OverlayType.MARKER,
                overlay: mockMarker
            });
            google.maps.event.trigger(self, 'markercomplete', mockMarker);

            // Exit draw mode automatically so user isn't stuck holding the marker tool
            this.setDrawingMode(null);
        };

        DrawingManager.prototype._finishShape = function (mode)
        {
            const coords = this._coords.slice(); // snapshot

            // Clear all temporary drawing assets before dispatching the final shape
            this._cancelCurrentDraw();

            const self = this;
            let mockOverlay;

            if (mode === OverlayType.POLYLINE)
            {
                mockOverlay = new google.maps.Polyline({
                    path: coords,
                    map: this._map,
                    strokeColor: '#1a73e8',
                    strokeWeight: 3,
                    strokeOpacity: 0.9,
                    clickable: true
                });
            } else if (mode === OverlayType.POLYGON)
            {
                mockOverlay = new google.maps.Polygon({
                    paths: [coords],
                    map: this._map,
                    strokeColor: '#1a73e8',
                    strokeWeight: 2,
                    strokeOpacity: 0.9,
                    fillColor: '#1a73e8',
                    fillOpacity: 0.25,
                    clickable: true
                });
            } else if (mode === OverlayType.CIRCLE)
            {
                mockOverlay = new google.maps.Circle({
                    center: coords[0],
                    radius: this._getRadiusMeters(coords[0], coords[1]),
                    map: this._map,
                    strokeColor: '#1a73e8',
                    strokeWeight: 2,
                    strokeOpacity: 0.9,
                    fillColor: '#1a73e8',
                    fillOpacity: 0.25,
                    clickable: true
                });
            } else if (mode === OverlayType.RECTANGLE)
            {
                mockOverlay = new google.maps.Rectangle({
                    bounds: this._getRectBounds(coords[0], coords[1]),
                    map: this._map,
                    strokeColor: '#1a73e8',
                    strokeWeight: 2,
                    strokeOpacity: 0.9,
                    fillColor: '#1a73e8',
                    fillOpacity: 0.25,
                    clickable: true
                });
            }

            google.maps.event.trigger(self, 'overlaycomplete', {
                type: mode,
                overlay: mockOverlay
            });
            google.maps.event.trigger(self, `${mode}complete`, mockOverlay);

            // Exit draw mode automatically so Place Edit panel can take priority cleanly
            this.setDrawingMode(null);
        };

        DrawingManager.prototype._getRectBounds = function (c0, c1)
        {
            // Bounds always requires NE to SW
            const [ lat0, lat1 ] = [ c0.lat(), c1.lat() ];
            const [ lng0, lng1 ] = [ c0.lng(), c1.lng() ];
            return {
                north: Math.max(lat0, lat1),
                south: Math.min(lat0, lat1),
                east:  Math.max(lng0, lng1),
                west:  Math.min(lng0, lng1),
            };
        };

        DrawingManager.prototype._tempDisableGestures = function (timeout = 300)
        {
            // Temporarily disable all gesture handling to prevent map zoom-in event upon double-click
            const self = this;
            this._map.setOptions({ gestureHandling: 'none' });
            setTimeout(() => self._map.setOptions({ gestureHandling: 'auto' }), timeout);
        };

        DrawingManager.prototype._getRadiusMeters = function (a, b)
        {
            // Haversine formula
            const R = 6371008.8; // Earth's mean radius in meters (WGS-84)
            const toRad = (d) => d * Math.PI / 180;
            const dLat = toRad(b.lat() - a.lat());
            const dLng = toRad(b.lng() - a.lng());
            const h = Math.sin(dLat / 2) ** 2 +
                Math.cos(toRad(a.lat())) * Math.cos(toRad(b.lat())) *
                Math.sin(dLng / 2) ** 2;
            return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
        }

        // ── Cursor & state helpers ─────────────────────────

        DrawingManager.prototype._updateCursor = function ()
        {
            if (!this._map) return;
            const container = this._map.getDiv ? this._map.getDiv() : null;

            if (this._currentMode)
            {
                if (container) container.style.cursor = 'crosshair';
                // Lock crosshairs and disable double click zooming while drawing
                this._map.setOptions({
                    draggableCursor: 'crosshair',
                    disableDoubleClickZoom: true
                });
            } else
            {
                if (container) container.style.cursor = '';
                // Restore map defaults
                this._map.setOptions({
                    draggableCursor: '',
                    disableDoubleClickZoom: false
                });
            }
        };

        DrawingManager.prototype._updateToolbarState = function ()
        {
            for (const mode in this._btnElements)
            {
                const btn = this._btnElements[mode];
                if (btn)
                {
                    btn.classList.toggle('mcx-draw-active', mode === (this._currentMode || 'hand'));
                }
            }
        };

        // ── Toolbar ────────────────────────────────────────

        DrawingManager.prototype._buildToolbar = function ()
        {
            if (this._toolbar) return;
            _injectStyles();

            const drawCtrlOpts = this._options.drawingControlOptions || {};
            const drawModes = drawCtrlOpts.drawingModes || [
                OverlayType.MARKER,
                OverlayType.CIRCLE,
                OverlayType.POLYLINE,
                OverlayType.POLYGON,
                OverlayType.RECTANGLE,
            ];
            const position = drawCtrlOpts.position != null
                ? drawCtrlOpts.position
                : google.maps.ControlPosition.TOP_CENTER;

            const toolbar = document.createElement('div');
            toolbar.className = 'mcx-draw-toolbar';

            const self = this;

            // Hand / Pan button (always present)
            const handBtn = _makeToolbarButton('hand', ICONS.hand, 'Pan', true, function ()
            {
                self.setDrawingMode(null);
            });
            toolbar.appendChild(handBtn);
            this._btnElements['hand'] = handBtn;

            // Mode buttons
            const modeLabels = {
                marker: 'Add Marker',
                circle: 'Draw Circle',
                polyline: 'Draw Line',
                polygon: 'Draw Polygon',
                rectangle: 'Draw Rectangle',
            };

            drawModes.forEach(function (mode)
            {
                const btn = _makeToolbarButton(
                    mode,
                    ICONS[mode] || ICONS.marker,
                    modeLabels[mode] || mode,
                    false,
                    () => self.setDrawingMode(mode),
                );
                toolbar.appendChild(btn);
                self._btnElements[mode] = btn;
            });

            this._toolbar = toolbar;
            this._map.controls[position].push(toolbar);

            // Set initial active state
            this._updateToolbarState();
        };

        // ── Private helpers ────────────────────────────────

        function _makeToolbarButton(mode, svgHtml, title, isActive, onClick)
        {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mcx-draw-btn' + (isActive ? ' mcx-draw-active' : '');
            btn.title = title;
            btn.setAttribute('data-mode', mode);
            btn.innerHTML = svgHtml;

            btn.addEventListener('click', function (e)
            {
                e.stopPropagation();
                onClick();
            });

            // Prevent the button from passing click events to the map
            btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });

            return btn;
        }

        return DrawingManager;
    }());

    // ── Namespace injection ────────────────────────────────

    window.google.maps.drawing = {
        OverlayType: OverlayType,
        DrawingManager: DrawingManager
    };

    console.log('[MCX] Drawing Manager Polyfill loaded (google.maps.drawing replacement).');

}());
