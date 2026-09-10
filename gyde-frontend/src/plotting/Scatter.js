import React, {useEffect, useMemo} from 'react';

import memoize from 'memoize-one';

import * as d3 from 'd3';
import {Axis, Orient} from 'd3-axis-for-react';
import {withResizeDetector} from 'react-resize-detector';


const CONSTANT_EMPTY_SET = new Set();
const CONST_ZERO = () => 0;


class Circle extends React.Component {
    static defaultProps = {
        size: 6,
        stroke: 'black'
    }

  render() {
    const {x, y, colour, stroke, children, size, ...rest} = this.props;
    return (
      <circle cx={ x }
              cy={ y }
              r={ size } 
              fill={ colour }
              stroke={ stroke }
              strokeWidth={0.5}
              {...rest} >
          { children }
      </circle>
    )
  }
}

let clipIdSeed = 0;

class Scatter extends React.Component {

    static defaultProps = {
        x: [],
        y: [],
        seqIds: [],
        dataRows: [],
        plotWidth: 400,
        plotHeight: 300,
        marginLeft: 50,
        marginRight: 50,
        marginTop: 50,
        marginBottom: 80,
        colour: '#8DC8E8',
        pairedCategoryColour: '#EE9966',
        glyph: Circle,
        selectionColour: '#ee1122',
        filteredColour: '#dddddd',
        dynamicWidth: false,
        dynamicHeight: false,
        xPxPerTick: 80,
        yPxPerTick: 80,
        colourByScaleDefaultColour: '#aaaaaa'
    }

    constructor(props) {
        super(props);

        this.state = {
            dragOriginX: null,
            dragOriginY: null,
            dragCurrentX: null,
            dragCurrentY: null,
            dragPath: null
        };

        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.jitter = this.jitter.bind(this);

        this.jitterCache = [];
        this.clipId = `scatter-clip-${++clipIdSeed}`;
    }

    onMouseDown(ev) {
        if (!this.props.onSelect) return;
        if (!this.backgroundBox) return;

        const bbox = this.backgroundBox.getBoundingClientRect(),
              plotX = ev.clientX - bbox.x, plotY = ev.clientY - bbox.y,
              dataX = this.xScale.invert(plotX), dataY = this.yScale.invert(plotY);

        if (dataX !== dataX || dataY !== dataY) {
            // NaN means scale is not valid, so cancel selection.
            return;
        }

        this.setState({
            dragOriginX: dataX,
            dragOriginY: dataY,
            dragCurrentX: dataX,
            dragCurrentY: dataY,
            dragPath: [[dataX, dataY]]
        });

        window.addEventListener('mousemove', this.onMouseMove, false);
        window.addEventListener('mouseup', this.onMouseUp, false);

    }

    onMouseMove(ev) {
        if (!this.backgroundBox) return;

        const bbox = this.backgroundBox.getBoundingClientRect(),
              plotX = ev.clientX - bbox.x, plotY = ev.clientY - bbox.y,
              dataX = this.xScale.invert(plotX), dataY = this.yScale.invert(plotY);

        this.setState((oldState) => ({
            dragCurrentX: dataX,
            dragCurrentY: dataY,
            dragPath: [...oldState.dragPath, [dataX, dataY]]
        }));
    }

    onMouseUp(ev) {
        if (this.backgroundBox) {
            const bbox = this.backgroundBox.getBoundingClientRect(),
                plotX = ev.clientX - bbox.x, plotY = ev.clientY - bbox.y,
                dataX = this.xScale.invert(plotX), dataY = this.yScale.invert(plotY);

            const selMinX = Math.min(this.state.dragOriginX, dataX),
                  selMaxX = Math.max(this.state.dragOriginX, dataX),
                  selMinY = Math.min(this.state.dragOriginY, dataY),
                  selMaxY = Math.max(this.state.dragOriginY, dataY)

            if (this.props.plotControlMode === 'select') {
                const {dataRows=[], x, y} = this.props;

                let selected;

                if (this.xScaleCategorical) {
                    const xscFull = this.xScaleCategorical.copy().range(this.xScale.domain());
                    selected = dataRows.filter((d, origIndex) => {
                        const dx = x[d],
                              dy = y[d];
                        if (dy >= selMinY && dy <= selMaxY) {
                            const mx = xscFull(dx) + ((0.45 + 0.08*this.jitter(origIndex)) * xscFull.bandwidth()) + this.pairOffset(d);
                            return (mx >= selMinX && mx <= selMaxX);
                        }
                    });
                } else {
                    selected = dataRows.filter((d) => {
                        const dx = x[d],
                              dy = y[d];
                        return dx >= selMinX && dx <= selMaxX && dy >= selMinY && dy <= selMaxY;
                    });
                }

                if (this.props.onSelect) {
                    this.props.onSelect(selected);
                }
            } else if (this.props.plotControlMode === 'lasso') {
                const {dataRows=[], x, y} = this.props;
                const polygon = [...this.state.dragPath, [dataX, dataY]]

                let selected;

                if (this.xScaleCategorical) {
                    const xscFull = this.xScaleCategorical.copy().range(this.xScale.domain());
                    selected = dataRows.filter((d, origIndex) => {
                        const dx = x[d],
                              dy = y[d];

                        const mx = xscFull(dx) + ((0.45 + 0.08*this.jitter(origIndex)) * xscFull.bandwidth()) + this.pairOffset(d);
                        return d3.polygonContains(polygon, [mx, dy]);
                    });
                } else {
                    selected = dataRows.filter((d) => {
                        const dx = x[d],
                              dy = y[d];
                        return d3.polygonContains(polygon, [dx, dy]);
                    });
                }

                if (this.props.onSelect) {
                    this.props.onSelect(selected);
                }
            } else if (this.props.plotControlMode === 'zoom') {
                if (this.props.onZoom) {
                    if (selMinX === selMaxX && selMinY === selMaxY) {
                        // quick click resets zoom
                        this.props.onZoom();
                    } else {
                        const norm = this.xScaleCategorical ? 1.0/this.width : 1.0;
                        this.props.onZoom(
                            selMinX * norm, selMaxX * norm, selMinY, selMaxY
                        );
                    }
                }
            }
        }

        this.setState({
            dragOriginX: null,
            dragOriginY: null,
            dragCurrentX: null,
            dragCurrentY: null,
            dragPath: null
        })

        window.removeEventListener('mousemove', this.onMouseMove, false);
        window.removeEventListener('mouseup', this.onMouseUp, false);
    }

    plottableDataIndices = memoize((x, y, categorical, dataRows) => {
        const filteredData = [];
        for (const i of dataRows) {
            if ((categorical ? x[i] :  typeof(x[i]) === 'number') && typeof(y[i]) === 'number') {
                filteredData.push(i);
            }
        }
        return filteredData;
    });

    filteredDataIDs = memoize((filteredItems) => new Set(filteredItems));

    x = memoize((x, categorical) => categorical ? x = x.map((v) => v ? typeof(v) !== 'string' ? v.toString() : v : v ) : x);

    xScaleCalc = memoize((x, hideFiltered, filteredDataIDs, categorical, logX, minX, maxX, width) => {
        let [xMin, xMax] = d3.extent(hideFiltered ? x.filter((_, i) => filteredDataIDs.has(i)) : x);
        if (minX !== undefined) xMin=minX;
        if (maxX !== undefined) xMax=maxX;


        let xScale;
        if (categorical) {
            let xRangeMin = 0,
                xRangeMax = width;

            const nxMin = typeof(xMin) === 'number' ? xMin : 0,
                  nxMax = typeof(xMax) === 'number' ? xMax : 1;

            const w = 1.0 / (nxMax - nxMin) * width;
            xRangeMin = -w * nxMin;
            xRangeMax = -w * nxMin + w;

            xScale = d3.scaleBand()
                .domain(x.filter((x) => x))
                .range([xRangeMin, xRangeMax]);
        } else if (logX) {
            xScale = d3.scaleLog()
                .domain([xMin, xMax])
                .range([0, width]);
        } else {
            xScale = d3.scaleLinear()
                .domain([xMin, xMax])
                .range([0, width]);
        }
        return xScale;
    });

    yScaleCalc = memoize((y, hideFiltered, filteredDataIDs, categorical, minY, maxY, logY, height, pairedCategoryFn) => {
        let [yMin, yMax] = d3.extent(hideFiltered ? y.filter((_, i) => filteredDataIDs.has(i)) : y);
        if (minY !== undefined) yMin=minY;
        if (maxY !== undefined) yMax=maxY;

        if (categorical && pairedCategoryFn) {
            // "Joiner lines" will be outside calculated extent.  Make some extra room for these.
            if (!maxY) {
                yMax = yMax + (yMax-yMin)*0.1;
            }
        }

        let yScale;
        if (logY) {
            yScale = d3.scaleLog();
        } else {
            yScale = d3.scaleLinear();
        }
        yScale
            .domain([yMin, yMax])
            .range([height, 0]);
        return yScale
    });

    colourByCalc = memoize((colourBy, colourByCategorical, logColourBy, minColourBy, maxColourBy, height) => {
        let colourByScale, colourByLegendScale;

        if (colourBy) {
            if (colourByCategorical) {
                colourByScale = d3.scaleOrdinal(d3.schemePaired).domain(colourBy.filter((x) => x));
            } else {
                let [cMin, cMax] = d3.extent(colourBy);
                if (minColourBy !== undefined) cMin=minColourBy;
                if (maxColourBy !== undefined) cMax=maxColourBy;
                if (logColourBy && cMin <=0) cMin = 0.1;
                const scaleType = logColourBy ? d3.scaleLog : d3.scaleLinear;
                colourByScale = scaleType().domain([cMin, (cMin+cMax)/2, cMax]).range(['#dddd00', '#008888', '#0000dd']);
                colourByLegendScale = scaleType().domain([cMin, (cMin+cMax)/2, cMax]).range([0.9*height, 0.5*height, 0.1*height]);
            }
        }

        return {colourByScale, colourByLegendScale}
    });

    render() {
        const {
            y, minX, maxX, minY, maxY, dataRows, seqIds,
            colour, selectionColour, filteredColour, xPxPerTick, yPxPerTick,
            marginLeft, marginTop, marginBottom, filteredItems,
            categorical, pairedCategoryFn, pairedCategoryColour, logX, logY,
            xAxisName, yAxisName, colourBy, logColourBy, minColourBy, maxColourBy,
            colourByAxisName, colourByCategorical, plotControlMode, hideFiltered} = this.props;

        const x = this.x(this.props.x, categorical);

        const selection = this.props.selection || CONSTANT_EMPTY_SET;
        const Glyph = this.props.glyph;

        let marginRight = this.props.marginRight;
        if (colourBy) {
            if (colourByCategorical) {
                marginRight += 150;
            } else {
                marginRight += 50;
            }
        }

        const width = (this.props.dynamicWidth && this.props.width) ? this.props.width - marginLeft - marginRight : this.props.plotWidth,
              height = (this.props.dynamicHeight && this.props.height) ? this.props.height - marginTop - marginBottom : this.props.plotHeight;

        this.width = width; // Stashed for drag handlers

        const {dragOriginX, dragOriginY, dragCurrentX, dragCurrentY, dragPath} = this.state;

        const plottableDataIndices = this.plottableDataIndices(x, y, categorical, dataRows);
        const filteredDataIDs = this.filteredDataIDs(filteredItems);

        const xScale = this.xScaleCalc(x, hideFiltered, filteredDataIDs, categorical, logX, minX, maxX, width);
        const yScale = this.yScaleCalc(y, hideFiltered, filteredDataIDs, categorical, minY, maxY, logY, height, pairedCategoryFn);

        let pairOffset = CONST_ZERO;
        let pairedCatInGroups = null,
            pairedCatOutGroups = null;

        if (categorical && pairedCategoryFn) {
            pairOffset = (d) => {
                if (pairedCategoryFn(d)) {
                    return -0.15 * xScale.bandwidth();
                } else {
                    return 0.15 * xScale.bandwidth()
                }
            };

            pairedCatInGroups = {};
            pairedCatOutGroups = {};
            for (const d of plottableDataIndices) {
                const group = x[d],
                      byGroupMap = pairedCategoryFn(d) ? pairedCatInGroups : pairedCatOutGroups;
                if (!byGroupMap[group]) byGroupMap[group] = [];
                byGroupMap[group].push(yScale(y[d]));
            }
        }
        this.pairOffset = pairOffset;

        const xMag = Math.max(...xScale.domain().map((x) => x === 0 ? 0 : Math.abs(Math.log10(x)))),
              yMag = Math.max(...yScale.domain().map((y) => y === 0 ? 0 : Math.abs(Math.log10(y))));

        this.yScale = yScale;  // stash for drag handlers.
        if (categorical) {
            this.xScale = d3.scaleLinear().domain([0, width]).range(xScale.range());
            this.xScaleCategorical = xScale;
        } else {
            this.xScale = xScale;
            this.xScaleCategorical = undefined;
        }

        let xAxisTickProps = undefined;
        if ((categorical && width/xScale.domain().length) < 80 || logX) {
            xAxisTickProps = {
                transform: 'rotate(-45)',
                textAnchor: 'end'
            };
        }

        const {colourByScale, colourByLegendScale} = this.colourByCalc(colourBy, colourByCategorical, logColourBy, minColourBy, maxColourBy, height);

        const correlation = this.pearsonCorrelation(x, y)

        return (
          <div style={{width: '100%'}} ref={this.props.targetRef}>
            <svg width={ marginLeft + width + marginRight }
                 height={ marginTop + height + marginBottom }
                 onMouseDown={this.onMouseDown}
                 ref={this.props.svgRef}>
              <clipPath id={this.clipId}>
                <rect width={width+12} height={height+12} x={-6} y={-6} />
              </clipPath>

              <g transform={`translate(${marginLeft}, ${marginTop})`}>
                {typeof(correlation) === 'number' 
                    ? <text textAnchor="middle" x={width/2} y={-5}>r = {correlation.toFixed(3)}</text> 
                    : undefined}

                <rect x={0}
                      y={0}
                      width={width}
                      height={height}
                      fill='blue'
                      onMouseDown={this.onMouseDown}
                      opacity={0}
                      ref={(el) => { this.backgroundBox = el }} />

                <g clipPath={`url(#${this.clipId})`} >
                  <ScatterPoints plottableDataIndices={plottableDataIndices}
                                 colour={colour}
                                 selection={selection}
                                 filteredDataIDs={filteredDataIDs}
                                 pairedCategoryFn={pairedCategoryFn}
                                 colourBy={colourBy}
                                 Glyph={Glyph}
                                 xScale={xScale}
                                 x={x}
                                 yScale={yScale}
                                 y={y}
                                 seqIds={seqIds}
                                 hideFiltered={hideFiltered}
                                 filteredColour={filteredColour}
                                 categorical={categorical}
                                 pairOffset={pairOffset}
                                 colourByScale={colourByScale}
                                 selectionColour={selectionColour}
                                 colourByScaleDefaultColour={this.props.colourByScaleDefaultColour}
                                 jitter={this.jitter} />

                  { pairedCatInGroups
                      ? xScale.domain().map((group) => {
                          if (pairedCatInGroups[group] && pairedCatOutGroups[group]) {
                              const inY = pairedCatInGroups[group].reduce((a, b) => Math.min(a, b)),
                                    outY = pairedCatOutGroups[group].reduce((a, b) => Math.min(a, b)),
                                    minY = Math.min(inY, outY),
                                    x = xScale(group) + xScale.bandwidth() * 0.5,
                                    dx = xScale.bandwidth() * 0.15;

                              return (
                                  <path key={group}
                                        d={`M${x-dx},${inY} L${x-dx},${minY-20} L${x+dx},${minY-20} L${x+dx},${outY}`}
                                        stroke="black"
                                        fill="none" />
                              )
                          }
                          return (<g key={group} />)
                      })
                      : null }
                </g>

                { dragOriginX !== null && plotControlMode !== 'lasso' &&
                    <rect x={Math.min(this.xScale(dragOriginX), this.xScale(dragCurrentX))}
                          y={Math.min(this.yScale(dragOriginY), this.yScale(dragCurrentY))}
                          width={Math.max(1, Math.abs(this.xScale(dragOriginX) - this.xScale(dragCurrentX)))}
                          height={Math.max(1, Math.abs(this.yScale(dragOriginY) - this.yScale(dragCurrentY)))}
                          fill='blue'
                          opacity={0.5} /> }
                {
                    (plotControlMode === 'lasso' && dragPath && dragPath.length > 0)
                        ? <path d={'M' + dragPath.map(([dx, dy]) => `${this.xScale(dx)},${this.yScale(dy)}`).join(' L')}
                                stroke="blue" strokeWidth="2" fill="none" />
                        : null }
              </g>
              <g transform={`translate(${marginLeft}, ${marginTop})`}>
                <Axis orient={Orient.left}
                      scale={yScale}
                      ticks={[Math.ceil(height/yPxPerTick)]}
                      tickFormat={yMag > 3 ? d3.format('.2e') : undefined} />
                <g transform={`rotate(-90 ${12-marginLeft} ${height/2})`}>
                    <text x={12-marginLeft}
                          y={height/2}
                          textAnchor="middle"
                          fill="black"
                          stroke="none">
                        { yAxisName }
                    </text>
                </g>

              </g>
              <g transform={`translate(${marginLeft}, ${marginTop+height})`}>
                <Axis orient={Orient.bottom}
                      scale={xScale}
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

              { colourBy
                ? colourByLegendScale
                  ? <g transform={`translate(${marginLeft+width+50}, ${marginTop})`}>
                      <Axis orient={Orient.right}
                            scale={colourByLegendScale} />
                      { d3.range(0.1*height, 0.9*height, 5).map((y, i) => (
                          <rect x={-12} width={10} height={5} y={y} fill={colourByScale(colourByLegendScale.invert(y))} key={i} />
                      )) } 
                      <g transform={`rotate(-90 40 ${height/2})`}>
                          <text x={40}
                                y={height/2}
                                textAnchor="middle"
                                fill="black"
                                stroke="none">
                              { colourByAxisName }
                          </text>
                      </g>
                    </g>
                  : <g transform={`translate(${marginLeft+width+20}, ${marginTop})`}>
                      { colourByScale.domain().map((item, i) => (
                        <rect x={0} y={i*20} width={20} height={15} key={i} fill={colourByScale(item)} stroke="none" />
                      )) }
                      { colourByScale.domain().map((item, i) => (
                        <text x={25} y={i*20+13} key={i} fill="black" stroke="none">{item}</text>
                      )) }
                    </g>
                : null}


            </svg>
          </div>
        )
    }

    jitter(i) {
        while (this.jitterCache.length <= i) {
            this.jitterCache.push(Math.random())
        }
        return this.jitterCache[i];
    }

    pearsonCorrelation = memoize((xcol, ycol) => {
        const xs = [], ys = [];
        for (let i = 0; i < Math.min(xcol.length, ycol.length); ++i) {
            const x = xcol[i], y = ycol[i];
            if (typeof(x) === 'number' && typeof(y) === 'number') {
                xs.push(x); ys.push(y);
            }
        }

        if (xs.length < 2) return;

        const n = xs.length;
        let totX = 0, totY = 0;
        for (let i = 0; i < n; ++i) {
            totX += xs[i]; totY += ys[i];
        }
        const meanX = totX / n, meanY = totY / n;

        let sumX2 = 0, sumY2 = 0, sumXY = 0;
        for (let i = 0; i < n; ++i) {
            const dx = xs[i] - meanX, dy = ys[i] - meanY;
            sumXY += (dx*dy);
            sumX2 += (dx*dx);
            sumY2 += (dy*dy);
        } 

        return sumXY / Math.sqrt(sumX2) / Math.sqrt(sumY2);
    })
}

function ScatterPoints({plottableDataIndices, colour, selection, filteredDataIDs, pairedCategoryFn, colourBy, Glyph, xScale, x, yScale, y, seqIds, hideFiltered, filteredColour, categorical, pairOffset, colourByScale, selectionColour, colourByScaleDefaultColour, jitter}) {
    return useMemo(() => (
        <React.Fragment>
            { plottableDataIndices.map((ix) => {
                  let pointColour = colour;
                  let opacity = undefined;

                  if (selection && selection.has(ix)) {
                      pointColour = selectionColour;
                  } else if (filteredDataIDs && !filteredDataIDs.has(ix)) {
                      if (hideFiltered) return null;
                      pointColour = filteredColour;
                  } else {
                      if (pairedCategoryFn && pairedCategoryFn(ix)) {
                          pointColour = pairedCategoryColour || colour;
                      } else if (colourBy) {
                          pointColour = colourByScale(colourBy[ix]);
                          if (!pointColour) {
                              pointColour = colourByScaleDefaultColour;
                              opacity = 0.5;
                          }
                      }
                  }

                  return (
                      <Glyph key={ ix }
                             x={ xScale(x[ix]) + (categorical ? ((0.45 + 0.08*jitter(ix)) * xScale.bandwidth()) : 0) + pairOffset(ix) }
                             y={ yScale(y[ix]) }
                             colour={ pointColour }
                             opacity={ opacity }>
                           <title>{ seqIds[ix] }</title>
                      </Glyph>
                  );
               }) }
        </React.Fragment>
    ), [plottableDataIndices, colour, selection, filteredDataIDs, pairedCategoryFn, colourBy, Glyph, xScale, x, yScale, y, seqIds, hideFiltered, filteredColour, categorical, pairOffset, colourByScale, selectionColour, colourByScaleDefaultColour]);
}

export default withResizeDetector(Scatter);
