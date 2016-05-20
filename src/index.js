var LightningVisualization = require('lightning-visualization');
var d3 = require('d3');
var _ = require('lodash')
var MultiaxisZoom = require('d3-multiaxis-zoom');
var utils = require('lightning-client-utils');
var fs = require('fs');
var css = fs.readFileSync(__dirname + '/style.css');

var Visualization = LightningVisualization.extend({

    getDefaultStyles: function() {
        return {
            color: '#68a1e5',
            stroke: 'white',
            size: 6
        }
    },

    getDefaultOptions: function() {
        return {
            brush: true,
            tooltips: true,
            zoom: true
        }
    },

    init: function() {
        MultiaxisZoom(d3);
        this.margin = {top: 0, right: 0, bottom: 0, left: 0};
        this.render();
    },

    css: css,

    render: function() {
        
        var data = this.data;
        var width = this.width;
        var height = this.height;
        var options = this.options;
        var self = this;

        var nodes = data.nodes;
        var links = data.links;

        // if points are colored use gray, otherwise use our default
        var linkStrokeColor = (data.group || data.color || data.values) ? '#999' : '#3c16ce';

        // set opacity inversely proportional to number of links
        var linkStrokeOpacity = Math.max(1 - 0.0005 * links.length, 0.5);

        // set circle stroke thickness based on number of nodes
        var strokeWidth = nodes.length > 500 ? 1 : 1.1

        this.makeScales()
        this.setScales()

        var zoom = d3.behavior.zoom()
            .x(self.x)
            .y(self.y)
            .on('zoom', zoomed);

        var container = d3.select(this.el)
            .append('div')
            .style('position', 'relative')
            .style('overflow', 'hidden')
            .style('width', width + "px")
            .style('height', height + "px")

        var canvas = container
            .append('canvas')
            .attr('class', 'graph-plot canvas')
            .attr('width', width)
            .attr('height', height)
            .call(zoom)
            .on("click", mouseHandler)
            .on("dblclick.zoom", null)

        var ctx = canvas
            .node().getContext('2d');

        if (!self.options.zoom) {
            canvas.on("wheel.zoom", null);
            canvas.on("mousewheel.zoom", null);
        }

        function mouseHandler() {
            if (d3.event.defaultPrevented) return;
            var pos = d3.mouse(this)
            var found = utils.nearestPoint(nodes, pos, self.x, self.y)

            if (found) {
                highlighted = []
                highlighted.push(found.i)
                self.emit('hover', found);
            } else {
                highlighted = []
                selected = []
                self.removeTooltip();
            };
            redraw();
        }

        var selected = [];
        var highlighted = [];
        var shiftKey;

        // setup brushing
        if (options.brush) {

            var brush = d3.svg.brush()
                .x(self.x)
                .y(self.y)
                .on("brushstart", function() {
                    // remove any highlighting
                    highlighted = []
                    self.removeTooltip();
                    // select a point if we click without extent
                    var pos = d3.mouse(this)
                    var found = utils.nearestPoint(nodes, pos, self.x, self.y)
                    if (found) {
                        if (_.indexOf(selected, found.i) == -1) {
                            selected.push(found.i)
                        } else {
                            _.remove(selected, function(d) {return d == found.i})
                        }
                        redraw();
                    }
                })
                .on("brush", function() {
                    var extent = d3.event.target.extent();
                    if (Math.abs(extent[0][0] - extent[1][0]) > 0 & Math.abs(extent[0][1] - extent[1][1]) > 0) {
                        selected = []
                        var x = self.x
                        var y = self.y
                        _.forEach(nodes, function(n) {
                            var cond1 = (n.x > extent[0][0] & n.x < extent[1][0])
                            var cond2 = (n.y > extent[0][1] & n.y < extent[1][1])
                            if (cond1 & cond2) {
                                selected.push(n.i)
                            }
                        })
                        redraw();
                    }
                })
                .on("brushend", function() {
                    d3.event.target.clear();
                    d3.select(this).call(d3.event.target);
                })

            var brushrect = container
                .append('svg:svg')
                .attr('class', 'graph-plot brush-container')
                .attr('width', width)
                .attr('height', height)
            .append("g")
                .attr('class', 'brush')
                .call(brush)

            d3.selectAll('.brush .background')
                .style('cursor', 'default')
            d3.selectAll('.brush')
                .style('pointer-events', 'none')

            d3.select(this.el).on("keydown", function() {
                shiftKey = d3.event.shiftKey;
                if (shiftKey) {
                    d3.selectAll('.brush').style('pointer-events', 'all')
                    d3.selectAll('.brush .background').style('cursor', 'crosshair')
                }
            });

            d3.select(this.el).on("keyup", function() {
                if (shiftKey) {
                    d3.selectAll('.brush').style('pointer-events', 'none')
                    d3.selectAll('.brush .background').style('cursor', 'default')
                }
                shiftKey = false
            });

        }

        function zoomed() {
            redraw();
        }

        // array indicating links
        var linkedByIndex = {};
        var i
        for (i = 0; i < nodes.length; i++) {
            linkedByIndex[i + ',' + i] = 1;
        };
        links.forEach(function (l) {
            linkedByIndex[self.getSource(l) + ',' + self.getTarget(l)] = 1;
        });

        // look up neighbor pairs
        function neighboring(a, b) {
            return linkedByIndex[a + ',' + b];
        }

    
        d3.select(this.el).attr("tabindex", -1)

        function redraw() {
            ctx.clearRect(0, 0, width, height);
            draw()
        }

        function draw() {

            _.forEach(links, function(l) {
                var alpha
                var source = self.getSource(l)
                var target = self.getTarget(l)
                if (selected.length > 0) {
                    if (_.indexOf(selected, source) > -1 & _.indexOf(selected, target) > -1) {
                        alpha = 0.9
                    } else {
                        alpha = 0.05
                    }
                } 
                if (highlighted.length > 0) {
                    if (_.indexOf(highlighted, source) > -1 | _.indexOf(highlighted, target) > -1) {
                        alpha = 0.9
                    } else {
                        alpha = 0.05
                    }
                } 
                if (selected.length == 0 & highlighted.length == 0) {
                    alpha = linkStrokeOpacity
                }

                var line = self.getLine(l)
                ctx.strokeStyle = utils.buildRGBA(linkStrokeColor, alpha);
                ctx.fillStyle = utils.buildRGBA(linkStrokeColor, alpha);
                ctx.lineWidth = 1 * Math.sqrt(l.value);
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(line[0][0], line[0][1])
                ctx.lineTo(line[1][0], line[1][1])

                var headlen = 20
                var angle = Math.atan2(line[1][1]-line[0][1],line[1][0]-line[0][0])
                ctx.moveTo(line[1][0]-6*Math.cos(angle), line[1][1]-6*Math.sin(angle))
                ctx.lineTo(line[1][0]-headlen*Math.cos(angle-Math.PI/12),line[1][1]-headlen*Math.sin(angle-Math.PI/12))

                //version fleches non remplie >
                /*
                ctx.moveTo(line[1][0]-6*Math.cos(angle), line[1][1]-6*Math.sin(angle))
                ctx.lineTo(line[1][0]-headlen*Math.cos(angle+Math.PI/12),line[1][1]-headlen*Math.sin(angle+Math.PI/12))
                */

                //Version fleche remplie
                ctx.lineTo(line[1][0]-headlen*Math.cos(angle+Math.PI/12),line[1][1]-headlen*Math.sin(angle+Math.PI/12))
                ctx.lineTo(line[1][0]-6*Math.cos(angle), line[1][1]-6*Math.sin(angle))
                ctx.fill()
                
                ctx.stroke()

            })

            _.forEach(nodes, function(n) {
                var alpha, stroke;
                if (selected.length > 0) {
                    if (_.indexOf(selected, n.i) >= 0) {
                        alpha = 0.9
                    } else {
                        alpha = 0.1
                    }
                } else {
                    alpha = 0.9
                }
                if (highlighted.length > 0) {
                    if (neighboring(nodes[highlighted[0]].i, n.i) | neighboring(n.i, nodes[highlighted[0]].i)) {
                        alpha = 0.9
                    } else {
                        alpha = 0.1
                    }
                }
                if (_.indexOf(highlighted, n.i) >= 0) {
                    stroke = "black"
                } else {
                    stroke = n.k
                }

                ctx.beginPath();
                ctx.arc(self.x(n.x), self.y(n.y), n.s, 0, 2 * Math.PI, false);
                //ctx.fillStyle = utils.buildRGBA(n.c, alpha)
                ctx.fillStyle = utils.buildRGBA(linkStrokeColor, alpha)
                ctx.lineWidth = strokeWidth
                ctx.strokeStyle = utils.buildRGBA(stroke, alpha)
                ctx.fill()
                ctx.stroke()
            })

            if(options.tooltips && highlighted.length) {
                self.showTooltip(self.data.nodes[highlighted[0]]);
            }

        }

        draw();

    },

    formatData: function(data) {
        var retColor = utils.getColorFromData(data);
        var retSize = data.size || [];
        var retName = data.name || [];
        var styles = this.styles

        var c, s

        data.nodes = data.nodes.map(function (d,i) {
            d.x = d[0]
            d.y = d[1]
            d.i = i
            c = retColor.length > 1 ? retColor[i] : retColor[0]
            s = retSize.length > 1 ? retSize[i] : retSize[0]
            d.c = c ? c : styles.color
            d.k = c ? c.darker(0.75) : styles.stroke
            d.s = s ? s : styles.size
            d.l = (data.labels || []).length > i ? data.labels[i] : null;
            return d;
        });

        data.links = data.links.map(function (d) {
            d.source = d[0];
            d.target = d[1];
            d.value = d[2];
            return d;
        });

        return data;
    },

    makeScales: function() {
        var self = this

        var xDomain = d3.extent(self.data.nodes, function(d) {
            return d.x;
        });

        var yDomain = d3.extent(self.data.nodes, function(d) {
            return d.y;
        });

        var sizeMax = d3.max(self.data.nodes, function(d) {
                return d.s;
            });

        if (sizeMax) {
            var padding = sizeMax * 2
        } else {
            var padding = 8 * 2 + 10
        }

        var xRng = Math.abs(xDomain[1] - xDomain[0])
        var yRng = Math.abs(yDomain[1] - yDomain[0])

        xDomain[0] -= xRng * 0.025
        xDomain[1] += xRng * 0.025
        yDomain[0] -= yRng * 0.025
        yDomain[1] += yRng * 0.025

        this.x = d3.scale.linear()
            .domain(xDomain)

        this.y = d3.scale.linear()
            .domain(yDomain)
    },

    setScales: function() {
        this.x.range([0, this.width])
        this.y.range([this.height, 0])
    },

    getSource: function(l) {
        return l.source
    },

    getTarget: function(l) {
        return l.target
    },

    getLine: function(link) {
        var self = this;
        var start = self.data.nodes[link.source]
        var end = self.data.nodes[link.target]
        return [[self.x(start.x), self.y(start.y)], [self.x(end.x), self.y(end.y)]]
    },

    getLabelForDataPoint: function(d) {
        if(!_.isNull(d.l) && !_.isUndefined(d.l)) {
            return d.l;
        }
        return ('id: ' + d.i);
    },

    buildTooltip: function(d) {

        var label = this.getLabelForDataPoint(d);
        this.removeTooltip();

        var cx = this.x(d.x);
        var cy = this.y(d.y);
        if(cx < 0 || cx > (this.width - this.margin.left - this.margin.right)) {
            return;
        }
        if(cy < 0 || cy > (this.height - this.margin.top - this.margin.bottom)) {
            return;
        }

        this.tooltipEl = document.createElement('div');
        this.tooltipEl.innerHTML = label;

        var styles = {
            left: (this.x(d.x) + this.margin.left - 50) + 'px',
            bottom: (this.height - this.y(d.y) + d.s + 5) + 'px',
            position: 'absolute',
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            textAlign: 'center',
            color: 'white',
            paddingTop: '5px',
            paddingBottom: '5px',
            fontSize: '12px',
            borderRadius: '4px',
            width: '100px',
            zIndex: '999'
        }
        _.extend(this.tooltipEl.style, styles)

    },

    renderTooltip: function() {
        var container = this.qwery(this.selector + ' div')[0];
        if(this.tooltipEl && container) {
            container.appendChild(this.tooltipEl);
        }
    },

    showTooltip: function(d) {
        this.buildTooltip(d);
        this.renderTooltip();
    },

    removeTooltip: function() {
        if(this.tooltipEl) {
            this.tooltipEl.remove();
            this.tooltipEl = null;
        }
    }

});


module.exports = Visualization;
