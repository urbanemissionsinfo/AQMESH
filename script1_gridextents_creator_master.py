import ntpath
from shapely.geometry import Polygon, mapping
import geopandas as gp
import glob
import pandas as pd
import os
import fiona

#shpfiles=glob.glob('shapefiles_grids/grids_INPUTCITY.shp')
shpfiles=glob.glob('/vol03/apnatools/apna-master/INPUTCITY/grids/grids_INPUTCITY.shp')

def path_leaf(path):
    head, tail = ntpath.split(path)
    return tail or ntpath.basename(head)

for shpfile in shpfiles:
    shpfiles1=(os.path.splitext(shpfile)[0])
    shpfiles2=path_leaf(shpfiles1)
    dd=fiona.open(shpfile)
    row=dd.bounds
    ef={}
    ef['Maille']=0
    ef['grid_name']=shpfiles2
    ef['geometry']=Polygon([(row[0], row[3]),(row[2], row[3]),(row[2], row[1]),(row[0], row[1]),(row[0], row[3])])
    ef1=pd.DataFrame.from_dict(ef,orient='index',)
    ef2=gp.GeoDataFrame(ef1.T)
    #ef2.to_file('shapefiles_gridextents/'+shpfiles2+'.shp')
    ef2.to_file('grids_INPUTCITY.shp')

