#!/usr/bin/python

import argparse
import pandas as pd
from shapely.geometry import Polygon, mapping
import simplekml
import numpy as np
import itertools
import geopandas as gp
import ntpath
import math
import shapely.wkt

# Instantiate the parser
"""
python gridkml_creator.py 50.30 25.7 0.01 0.01 50 60 "grids_bhopal.kml"

swlong =50.30
swlat =25.7
gridx =0.01
gridy =0.01
nx =50
ny =60
"""

def map_extent(plot_extent): 
    geo_fe = Polygon([
        [plot_extent['w'], plot_extent['s']],
        [plot_extent['w'], plot_extent['n']],
        [plot_extent['e'], plot_extent['n']],
        [plot_extent['e'], plot_extent['s']]
    ])
    return geo_fe

def crs_find_centroid(swlong, swlat, gridx, gridy, nx, ny):
    nelong = swlong + (gridx * nx)
    nelat  = swlat  + (gridy * ny)
    plot_extent = {}
    plot_extent['w'], plot_extent['s'], plot_extent['n'], plot_extent['e'] = swlong, swlat, nelat, nelong
    geo_extent     = map_extent(plot_extent)
    cen_map_extent = geo_extent.centroid
    lat = cen_map_extent.y
    lon = cen_map_extent.x
    utm_band = str((math.floor((lon + 180) / 6) % 60) + 1)
    if len(utm_band) == 1:
        utm_band = '0' + utm_band
    epsg_code = '326' + utm_band if lat >= 0 else '327' + utm_band
    return epsg_code


def gridcreator(swlong, swlat, gridx, gridy, nx, ny):
    """
    Creates polygon grids as a geometry list for the specified variables.

    Parameters
    ----------
    swlong : south west longitude (float, degree decimals)
    swlat  : south west latitude  (float, degree decimals)
    gridx  : grid width  in degrees (float)
    gridy  : grid height in degrees (float)
    nx     : number of grids in x direction (int)
    ny     : number of grids in y direction (int)

    Returns
    -------
    list of shapely Polygon geometries
    """
    nelong = swlong + (gridx * nx)
    nelat  = swlat  + (gridy * ny)
    xmin, ymin, xmax, ymax = swlong, swlat, nelong, nelat
    gridWidth  = gridx
    gridHeight = gridy
    rows = round((ymax - ymin) / gridHeight)
    cols = round((xmax - xmin) / gridWidth)
    ringXleftOrigin   = xmin
    ringXrightOrigin  = xmin + gridWidth
    ringYtopOrigin    = ymax
    ringYbottomOrigin = ymax - gridHeight
    polygun1 = []
    for i in np.arange(cols):
        ringYtop    = ringYtopOrigin
        ringYbottom = ringYbottomOrigin
        for j in np.arange(rows):
            polygon = Polygon([
                (ringXleftOrigin,  ringYtop),
                (ringXrightOrigin, ringYtop),
                (ringXrightOrigin, ringYbottom),
                (ringXleftOrigin,  ringYbottom)
            ])
            polygun1.append(polygon)
            ringYtop    -= gridHeight
            ringYbottom -= gridHeight
        ringXleftOrigin  += gridWidth
        ringXrightOrigin += gridWidth
    return polygun1


def maille_counter(grid_df):
    """
    Creates a pandas DataFrame with Maille, Maille_X, and Maille_Y columns.

    Parameters
    ----------
    grid_df : pandas DataFrame with polygon geometries

    Returns
    -------
    pandas DataFrame with Maille columns
    """
    grid_df.columns = ['geometry']
    grid_df['gn']   = np.arange(1, len(grid_df.index) + 1, 1)
    wef = grid_df['gn'].to_numpy()
    o = wef.reshape(nx, ny)
    p = o.T
    q = np.ravel(p, order='F')
    b = wef.reshape(ny, nx)
    c = b.T
    d = np.rot90(c, 1)
    e = np.ravel(d, order='F')
    qq = pd.DataFrame()
    qq['gn']     = q
    qq['Maille'] = e
    qq1  = qq.sort_values('Maille')
    ww1  = pd.merge(grid_df, qq1)
    rows = np.arange(1, ny + 1, 1)
    cols = np.arange(1, nx + 1, 1)
    rows1 = [rows] * nx
    rows2 = [item for sublist in rows1 for item in sublist]
    rows3 = np.fliplr([rows2])[0]
    cols1 = list(itertools.chain.from_iterable(itertools.repeat(x, ny) for x in cols))
    ww1['Maille_Y'] = rows3
    ww1['Maille_X'] = cols1
    return ww1


def xy_maker(maille_grid, epsg_code):
    """
    Creates a GeoDataFrame with centroid, corner coordinates, and cell area.

    Parameters
    ----------
    maille_grid : DataFrame with Maille grids
    epsg_code   : EPSG code string for area calculation

    Returns
    -------
    GeoDataFrame
    """
    # FIX: use .apply() instead of deprecated .map() on geometry series
    maille_grid['centroid'] = maille_grid['geometry'].apply(lambda x: x.centroid)
    maille_grid['X']  = maille_grid['centroid'].apply(lambda p: p.x)
    maille_grid['Y']  = maille_grid['centroid'].apply(lambda p: p.y)
    maille_grid['X1'] = maille_grid['geometry'].apply(lambda x: x.exterior.coords[3][0])
    maille_grid['Y1'] = maille_grid['geometry'].apply(lambda x: x.exterior.coords[3][1])
    maille_grid['X2'] = maille_grid['geometry'].apply(lambda x: x.exterior.coords[1][0])
    maille_grid['Y2'] = maille_grid['geometry'].apply(lambda x: x.exterior.coords[1][1])
    maille_grid.drop(['centroid', 'gn'], axis=1, inplace=True)
    maille_grid1 = maille_grid.sort_values('Maille')

    # FIX: use CRS string 'epsg:4326' instead of deprecated {'init': 'epsg:4326'}
    maille_grid2 = gp.GeoDataFrame(maille_grid1, geometry='geometry', crs='epsg:4326')

    # FIX: use 'epsg:XXXXX' string instead of deprecated {'init': 'epsg:XXXXX'}
    maille_grid2['area_cell'] = (
        maille_grid2['geometry']
        .to_crs(epsg=int(epsg_code))
        .apply(lambda p: p.area / 10**6)
    )

    maille_grid3 = maille_grid2.reset_index(drop=True)
    return maille_grid3


def path_leaf(path):
    """
    Get filename without extension from a given path.

    Parameters
    ----------
    path : full file path with extension

    Returns
    -------
    str : filename without extension
    """
    head, tail = ntpath.split(path)
    return tail or ntpath.basename(head)


def shp_kml_maker(ue_grid, filepath):
    """
    Creates KML, SHP, and CSV files with grid balloon details.

    Parameters
    ----------
    ue_grid  : GeoDataFrame
    filepath : output KML file path
    """
    shpfilename = filepath.replace('.kml', '.shp')
    csvfilename = filepath.replace('.kml', '.csv')
    float_formatcolumns = ['X', 'Y', 'X1', 'Y1', 'X2', 'Y2', 'area_cell']

    ue_grid_p1 = ue_grid.drop(float_formatcolumns, axis=1)

    # FIX: applymap renamed to map in pandas 2.1+
    ue_grid_p2 = ue_grid[float_formatcolumns].map(lambda x: '{0:.4f}'.format(x))

    ue_grid = ue_grid_p1.join(ue_grid_p2)
    # enforce column order
    ue_grid = ue_grid[['geometry', 'Maille', 'Maille_X', 'Maille_Y', 'X', 'Y', 'X1', 'Y1', 'X2', 'Y2', 'area_cell']]

    ue_grid['geometry'] = ue_grid['geometry'].apply(
        lambda x: shapely.wkt.loads(shapely.wkt.dumps(x, rounding_precision=3))
    )
    ue_grid.to_file(shpfilename, index=False)

    ue_grid1 = ue_grid.drop(['geometry'], axis=1)
    ue_grid1.to_csv(csvfilename, index=False, float_format='%.4f')

    # making the kml balloon text
    ue_grid['exterior_cords'] = ue_grid['geometry'].apply(lambda x: x.exterior.coords)
    ue_grid['table'] = (
        "Maille:"    + ue_grid.Maille.map(str)   +
        "\n Maille_X:" + ue_grid.Maille_X.map(str) +
        "\n Maille_Y:" + ue_grid.Maille_Y.map(str) +
        "\n X:"        + ue_grid.X.map(str)         +
        "\n Y:"        + ue_grid.Y.map(str)         +
        "\n X1:"       + ue_grid.X1.map(str)        +
        "\n Y1:"       + ue_grid.Y1.map(str)        +
        "\n X2:"       + ue_grid.X2.map(str)        +
        "\n Y2:"       + ue_grid.Y2.map(str)        +
        "\n area_cell:"+ ue_grid.area_cell.map(str)
    )

    kml = simplekml.Kml()
    for index, row in ue_grid.iterrows():
        pol = kml.newpolygon(name="Maille_" + str(row['Maille']))
        pol.outerboundaryis          = row['exterior_cords']
        pol.style.balloonstyle.text  = row['table']

    print("The grid is being computed, please wait")
    kml.save(path=filepath)


# ── argument parsing ──────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(
    description='Generates grids as a KML file. Provide the following arguments:'
)
parser.add_argument('swlong',     type=float, help='South west longitude (float, degree decimals)')
parser.add_argument('swlat',      type=float, help='South west latitude  (float, degree decimals)')
parser.add_argument('gridx',      type=float, help='Grid width  in degrees (float)')
parser.add_argument('gridy',      type=float, help='Grid height in degrees (float)')
parser.add_argument('nx',         type=int,   help='Number of grids in x direction (int)')
parser.add_argument('ny',         type=int,   help='Number of grids in y direction (int)')
parser.add_argument('fileNames',  nargs='*',  help='Output KML file path', default=['val1'])

args = parser.parse_args()

swlong   = args.swlong
swlat    = args.swlat
gridx    = args.gridx
gridy    = args.gridy
nx       = args.nx
ny       = args.ny
filepath = args.fileNames[0]

epsg_code      = crs_find_centroid(swlong, swlat, gridx, gridy, nx, ny)
print("EPSG code of the given region is ", epsg_code)

grids_poly     = gridcreator(swlong, swlat, gridx, gridy, nx, ny)
grid_df        = pd.DataFrame(grids_poly)
maille_grid_df = maille_counter(grid_df)
epsg_code      = crs_find_centroid(swlong, swlat, gridx, gridy, nx, ny)
ue_grid        = xy_maker(maille_grid_df, epsg_code)

shp_kml_maker(ue_grid, filepath)
