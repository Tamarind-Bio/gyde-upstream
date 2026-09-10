import React from 'react';
import * as d3 from 'd3';
import {Axis, Orient} from 'd3-axis-for-react';
import {withResizeDetector} from 'react-resize-detector';

let clipIdSeed = 0;

class Histogram extends React.Component {

    static defaultProps = {
        thresholds: 20,
        x: (i) => i,
        plotWidth: 400,
        plotHeight: 300,
        marginLeft: 50,
        marginRight: 50,
        marginTop: 50,
        marginBottom: 50,
        colour: '#8DC8E8',
        filteredColour: '#DDDDDD',
        selectionColour: '#ee1122',
        dynamicWidth: false,
        dynamicHeight: false,
        xPxPerTick: 80,
        yPxPerTick: 80
    }

    constructor(props) {
        super(props);

        this.state = {
            dragOrigin: null,
            dragCurrent: null
        };

        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);

        this.clipId = `histo-clip-clip-${++clipIdSeed}`;
    }

    onMouseDown(ev) {
        if (!this.props.onSelect) return;
        if (!this.backgroundBox) return;

        const bbox = this.backgroundBox.getBoundingClientRect(),
              plotX = ev.clientX - bbox.x,
              dataX = this.xScale.invert(plotX);

        if (dataX !== dataX) {
            // NaN means xScale is not valid, so cancel selection.
            return;
        }

        this.setState({
            dragOrigin: dataX,
            dragCurrent: dataX
        });

        window.addEventListener('mousemove', this.onMouseMove, false);
        window.addEventListener('mouseup', this.onMouseUp, false);
    }

    onMouseMove(ev) {
        if (!this.backgroundBox) return;

        const bbox = this.backgroundBox.getBoundingClientRect(),
              plotX = ev.clientX - bbox.x,
              dataX = this.xScale.invert(plotX);

        this.setState({
            dragCurrent: dataX
        });
    }

    onMouseUp(ev) {
        if (this.backgroundBox) {
            const bbox = this.backgroundBox.getBoundingClientRect(),
                  plotX = ev.clientX - bbox.x,
                  dataX = this.xScale.invert(plotX);

            const selMin = Math.min(this.state.dragOrigin, dataX),
                  selMax = Math.max(this.state.dragOrigin, dataX);

            if (this.props.plotControlMode === 'select') {
                const {dataRows=[], x} = this.props;

                let selected;

                if (this.xScaleCategorical) {
                    selected = dataRows.filter((d) => {
                        const dx = x[d];
                        const minBandX = this.xScaleCategorical(dx),
                              maxBandX = minBandX + this.xScaleCategorical.bandwidth();

                        return (minBandX < selMax && maxBandX > selMin);
                    });
                } else {
                    selected = dataRows.filter((d) => {
                        const dx = x[d];
                        return dx >= selMin && dx <= selMax
                    });
                }
                if (selected && this.props.onSelect) {
                    this.props.onSelect(selected);
                }
            } else if (this.props.plotControlMode === 'zoom') {
                if (this.props.onZoom) {
                    if (selMin === selMax) {
                        // quick click resets zoom
                        this.props.onZoom();
                    } else {
                        const norm = this.xScaleCategorical ? 1.0/this.width : 1.0;
                        this.props.onZoom(
                            selMin * norm, selMax * norm, undefined, undefined
                        );
                    }
                }
            }
        }

        this.setState({
            dragOrigin: null,
            dragCurrent: null
        })

        window.removeEventListener('mousemove', this.onMouseMove, false);
        window.removeEventListener('mouseup', this.onMouseUp, false);
    }

    render() {
        const {
            selection, filteredItems=[], dataRows=[], hideFiltered,
            minX, maxX, minY, maxY, thresholds, colour, selectionColour, filteredColour,
            xPxPerTick, yPxPerTick, categorical, logX,
            marginLeft, marginRight, marginTop, marginBottom, xAxisName} = this.props;

        let x = this.props.x;
        if (categorical) {
            x = x.map((v) => v ? typeof(v) !== 'string' ? v.toString() : v : v )
        }

        const width = (this.props.dynamicWidth && this.props.width) ? this.props.width - marginLeft - marginRight : this.props.plotWidth,
              height = (this.props.dynamicHeight && this.props.height) ? this.props.height - marginTop - marginBottom : this.props.plotHeight;

        this.width = width; // Stashed for drag handlers

        const {dragOrigin, dragCurrent} = this.state;

        const filteredDataIDs = new Set(filteredItems);

        let xScale, xScaleCategorical, unfilteredBins, bins;
        let xRangeMin = 0, xRangeMax = width;
        if (categorical) {
            const nminX = typeof(minX) === 'number' ? minX : 0,
                  nmaxX = typeof(maxX) === 'number' ? maxX : 1;

            const span = nmaxX - nminX;
            const w = (span === 0 ? 1 : 1.0 / span) * width;
            xRangeMin = -w * nminX;
            xRangeMax = -w * nminX + w;

            xScaleCategorical = d3.scaleBand()
                .domain(x.filter((x) => x))
                .range([0, width]);

            unfilteredBins = xScaleCategorical.domain().map((group) => {
                const bin = dataRows.filter((d) => x[d] === group);
                bin.x0 = xScaleCategorical(group) - 0.45 * xScaleCategorical.bandwidth();
                bin.x1 = xScaleCategorical(group) + 0.45 * xScaleCategorical.bandwidth();
                return bin;
            })
        } else {
            const binner = unfilteredBins =  d3.bin()
                .value(logX ? (d) => {const v = x[d]; if (typeof(v) === 'number') return Math.log10(v);} : (d) => x[d])
                .thresholds(thresholds);

            if (minX !== undefined || maxX !== undefined) {
                const [minExtent, maxExtent] = d3.extent(x, logX ? (v) => {if (typeof(v) === 'number') return Math.log10(v);} : (d) => d);
                binner.domain([minX === undefined ? minExtent : minX, maxX === undefined ? maxExtent : maxX]);
            }

            unfilteredBins = binner(dataRows);
        }

        const firstBin = unfilteredBins?.[0];
        const lastBin = unfilteredBins?.[unfilteredBins.length - 1];
        if (!firstBin || firstBin.x0 == null || lastBin == null || lastBin.x1 == null) {
            return (
              <div style={{width: '100%', minHeight: height + marginTop + marginBottom, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666'}} ref={this.props.targetRef}>
                No values to plot
              </div>
            );
        }

        bins = filteredItems.length === dataRows.length
          ? unfilteredBins
          : unfilteredBins.map((ubin) => {
             const bin = ubin.filter((d) => filteredDataIDs.has(d));
             bin.x0 = ubin.x0;
             bin.x1 = ubin.x1;
             return bin;
          })


        if (categorical) {
            xScale = d3.scaleLinear().domain([firstBin.x0, lastBin.x1]).range([xRangeMin, xRangeMax]);
        } else if (logX) {
            xScale = d3.scaleLog()
              .domain([Math.pow(10, firstBin.x0), Math.pow(10, lastBin.x1)])
              .range([0, width]);
            for (const bin of bins) {
                bin.x0 = Math.pow(10, bin.x0);
                bin.x1 = Math.pow(10, bin.x1);
            }
            for (const bin of unfilteredBins) {
                bin.x0 = Math.pow(10, bin.x0);
                bin.x1 = Math.pow(10, bin.x1);
            }
        } else {
            xScale = d3.scaleLinear()
              .domain([firstBin.x0, lastBin.x1])
              .range([0, width]);
        }


        const yScale = d3.scaleLinear()
            .domain([0, d3.max(hideFiltered ? bins : unfilteredBins, (b) => b.length)])
            .range([height, 0]);

        const xMag = Math.max(...xScale.domain().map((x) => x === 0 ? 0 : Math.abs(Math.log10(x)))),
              yMag = Math.max(...yScale.domain().map((y) => y === 0 ? 0 : Math.abs(Math.log10(y))));

        this.xScale = xScale; this.xScaleCategorical = xScaleCategorical; this.yScale = yScale;  // stash for drag handlers.

        let xAxisTickProps = undefined;
        if (categorical && (width/xScaleCategorical.domain().length) < 80) {
            xAxisTickProps = {
                transform: 'rotate(-45)',
                textAnchor: 'end'
            };
        }

        return (
          <div style={{width: '100%'}} ref={this.props.targetRef}>
            <svg width={ marginLeft + width + marginRight }
                 height={ marginTop + height + marginBottom }
                 ref={this.props.svgRef}>
              <clipPath id={this.clipId}>
                <rect width={width} height={height} x={0} y={0} />
              </clipPath>

              <g transform={`translate(${marginLeft}, ${marginTop})`}>
                <rect x={0}
                      y={0}
                      width={width}
                      height={height}
                      fill='blue'
                      onMouseDown={this.onMouseDown}
                      opacity={0}
                      ref={(el) => { this.backgroundBox = el }} />

                <g clipPath={`url(#${this.clipId})`} >
                    { (hideFiltered ? [] : unfilteredBins).map((bin, bix) => (
                        <rect key={ bix }
                              x={ xScale(bin.x0) }
                              y={ yScale(bin.length) }
                              width={ xScale(bin.x1) - xScale(bin.x0) }
                              height={ yScale(0) - yScale(bin.length) }
                              fill={ filteredColour }
                              pointerEvents="none" />
                        )) }

                    { bins.map((bin, bix) => (
                        <rect key={ bix }
                              x={ xScale(bin.x0) }
                              y={ yScale(bin.length) }
                              width={ xScale(bin.x1) - xScale(bin.x0) }
                              height={ yScale(0) - yScale(bin.length) }
                              fill={ colour }
                              stroke='darkblue'
                              pointerEvents="none" />
                        )) }
                </g>

                { dragOrigin !== null &&
                    <rect x={Math.min(xScale(dragOrigin), xScale(dragCurrent))}
                          y={0}
                          width={Math.max(1, Math.abs(xScale(dragOrigin) - xScale(dragCurrent)))}
                          height={height}
                          fill='blue'
                          opacity={0.5} /> }

                { Array.from(selection || []).map((sel) => {
                    const selectX = x[sel];
                    return (
                        <line x1={xScale(selectX)}
                              y1={yScale(0)}
                              x2={xScale(selectX)}
                              y2={yScale(yScale.domain()[1])}
                              stroke={selectionColour} />
                    ) } ) }
              </g>
              <g transform={`translate(${marginLeft}, ${marginTop})`}>
                <Axis orient={Orient.left}
                      scale={yScale}
                      ticks={[Math.ceil(height/yPxPerTick)]}
                      tickFormat={yMag > 3 ? d3.format('.2e') : undefined} />
              </g>
              <g transform={`translate(${marginLeft}, ${marginTop+height})`}>
                <Axis orient={Orient.bottom}
                      scale={xScaleCategorical ? xScaleCategorical.copy().range(xScale.range()) : xScale}
                      ticks={[Math.ceil(width/xPxPerTick)]}
                      tickFormat={xMag > 3 ? d3.format('.2e') : undefined}
                      tickTextProps={xAxisTickProps} />
                <text x={width/2}
                      y={marginBottom-5}
                      textAnchor="middle"
                      fill="black"
                      stroke="none">
                    { xAxisName }
                </text>
              </g>
            </svg>
          </div>
        )
    }
}

export default withResizeDetector(Histogram);
