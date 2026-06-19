clear all;clc;
tic;
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%indir=['/home/xuj/Documents/AIS/201902/decoded/'];
for month=1:12;
year=2019;
year=2020;
year=2021;
year=2022;
%year=2018;
%year=2023;


month_str=num2str(month,'%02d');
year_str=num2str(year,'%04d');
indir=['/tank0/store0/sli/data/CCG_ais/full_time/',year_str,month_str,'/'];
%indir=['/home/xuj/Documents/AIS/2020/decoded/'];
%outdir=['/tank0/store0/sli/data/chedabucto_bay_2023/vessel_density/'];
%outdir=['/home/xuj/sli/data/sab_csas_2024/vessel_density/'];
outdir=['/home/xuj/work/project/cabotStrait/vessel_density/'];


% % center_lat=44.4957;
% % center_lon=-63.4970;
%%%%%%%%%%%%%%%unit: knot
max_speed=60;
min_speed=0;
%m_proj('lambert','lons',[-63 -60],'lat',[44.5 46]);
% % latmax = 48;
% % latmin = 42;
% % lonmax = -58;
% % lonmin = -65;

% % %   g=figure;
% % %     set(gcf, 'Position',  [100, 100, 1600, 1000]);
% % %     m_proj('lambert','lons',[-64 -63],'lat',[44.2 44.8]);
% % %     %m_proj('lambert','lons',[-61.5 -60.5],'lat',[45 45.67]);
% % % 
% % %     m_plot(center_lon,center_lat,'ro','MarkerSize',15)
% % %     hold on;
% % %     set(gca,'FontSize',25);
% % %     m_gshhs_f('patch',[.5 .5 .5],'edgecolor','none');
% % %       %hold on;
% % %  m_grid('tickdir','out','linewi',2,'fontsize',20);

% latmax = 46;
% latmin = 40;
% lonmax = -61.5;
% lonmin = -69.5;
latmax = 48.25;
latmin = 46;
lonmax = -58;
lonmin = -61.5;
% % latmax = 44.8;
% % latmin = 44.2;
% % lonmax = -63;
% % lonmin = -64;


%%%%%%%AIS data interpolation is set to 10s. keep 10*speed < grid size
%%%%%%%grid_interval in longitude direction is set to twice of the
%%%%%%%grid_interval below
grid_interval=0.001;
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

% month_str=num2str(month,'%02d');
% year_str=num2str(year,'%04d');
glat=[latmin:grid_interval:latmax];
glon=[lonmin:grid_interval*2:lonmax];
clat=[latmin+grid_interval*0.5:grid_interval:latmax-grid_interval*0.5];
clon=[lonmin+grid_interval:grid_interval*2:lonmax-grid_interval];

clat=flip(clat);
glat=flip(glat);
%[clon,clat]=meshgrid(glon,glat);


disp('Initializing...')


files=dir(fullfile([indir,'Dynamic_CCG_AIS_Log_',year_str,'-',month_str,'*.nc']));

name={files.name};
valid_name=(char(name));
num_file=length(valid_name(:,1));
num_file_str=num2str(num_file,'%03d');


aaa=length(glon)-1;
bbb=length(glat)-1;
       
file2=[outdir,year_str,month_str,'_ship_time.nc'];
ncid=netcdf.create(file2,'64BIT_OFFSET');
dimt = netcdf.defDim(ncid,'t',netcdf.getConstant('NC_UNLIMITED')); 
dimx = netcdf.defDim(ncid,'x',aaa);
dimy = netcdf.defDim(ncid,'y',bbb);
var_lon = netcdf.defVar(ncid,'longitude','double',dimx);
var_lat = netcdf.defVar(ncid,'latitude','double',dimy);
var_shiptime = netcdf.defVar(ncid,'ship_time','double',[dimx dimy dimt]);
var_time = netcdf.defVar(ncid,'time','double',dimt);
netcdf.endDef(ncid);


netcdf.putVar(ncid,var_lon,clon);
netcdf.putVar(ncid,var_lat,clat);
%for n=1:1;
for n=1:num_file;
    nn=num2str(n,'%03d');
file1=[indir,valid_name(n,:)];
lon=ncread(file1,'longitude');
lat=ncread(file1,'latitude');
mmsi=ncread(file1,'mmsi');
speed=ncread(file1,'speed');
% yyyy=(ncread(file1,'year'));
% mmmm=(ncread(file1,'month'));
% dddd=(ncread(file1,'day'));
% hhhh=(ncread(file1,'hour'));
% mmm=(ncread(file1,'minute'));
% sss=(ncread(file1,'second'));
%date_num=datenum(yyyy,mmmm,dddd,hhhh,mmm,sss)*24*3600;
date_num=double(ncread(file1,'date_num'))+datenum(1970,1,1)*24*3600;
apx=find(isnan(date_num));
lon(apx)=[];
lat(apx)=[];
mmsi(apx)=[];
date_num(apx)=[];
speed(apx)=[];
clear apx;

apx=find(speed<min_speed);
lon(apx)=[];
lat(apx)=[];
mmsi(apx)=[];
date_num(apx)=[];
speed(apx)=[];
clear apx;

apx=find(speed > max_speed);
lon(apx)=[];
lat(apx)=[];
mmsi(apx)=[];
date_num(apx)=[];
speed(apx)=[];
clear apx;



apx=find(lat>latmax-0.01);
lon(apx)=[];
lat(apx)=[];
mmsi(apx)=[];
date_num(apx)=[];
speed(apx)=[];
clear apx;
apx=find(lat<latmin+0.01);
lon(apx)=[];
lat(apx)=[];
mmsi(apx)=[];
date_num(apx)=[];
speed(apx)=[];
clear apx;
apx=find(lon<lonmin+0.02);
lon(apx)=[];
lat(apx)=[];
mmsi(apx)=[];
date_num(apx)=[];
speed(apx)=[];
clear apx;
apx=find(lon>lonmax-0.02);
lon(apx)=[];
lat(apx)=[];
mmsi(apx)=[];
date_num(apx)=[];
speed(apx)=[];
clear apx;
apx=find(isnan(lon));
lon(apx)=[];
lat(apx)=[];
mmsi(apx)=[];
date_num(apx)=[];
speed(apx)=[];
clear apx;

apx=find(isnan(lat));
lon(apx)=[];
lat(apx)=[];
mmsi(apx)=[];
date_num(apx)=[];
speed(apx)=[];
clear apx;

apx=find(isnan(mmsi));
lon(apx)=[];
lat(apx)=[];
mmsi(apx)=[];
date_num(apx)=[];
speed(apx)=[];
clear apx;


mmsin=unique(mmsi);
ship_num=length(mmsin);
ship_num_str=num2str(ship_num,'%04d');
ship_time=zeros(length(clon),length(clat));
for s=1:ship_num;
    ss=num2str(s,'%04d');
    
    disp(['Date: ',year_str,'/ ',month_str,'  file number: ',nn,' out of ',num_file_str,' --- ship number ',ss,' out of ',ship_num_str]);
    
    aps=find(mmsi==mmsin(s));
   
        date_nums=date_num(aps);
        lons=lon(aps);
        lats=lat(aps);
        mmsis=mmsi(aps);
        speeds=speed(aps);
        clear aps
        [date_nums,uu]=unique(date_nums);
        lons=lons(uu);
        lats=lats(uu);
        mmsis=mmsis(uu);
        speeds=speeds(uu);
        clear uu
        [date_nums,I]=sort(date_nums);
        lons=lons(I);
        lats=lats(I);
        mmsis=mmsis(I);
        speeds=speeds(I);
        clear I
        if (length(date_nums)>1)
            for l=2:length(date_nums);
                d_date(l)=date_nums(l)-date_nums(l-1);

            end
        else
            d_date=[];
        end
        aps=find(d_date>10*60);
        date_nums(aps)=[];
        lons(aps)=[];
        lats(aps)=[];
        mmsis(aps)=[];
        speeds(aps)=[];
        clear aps d_date
        if (length(date_nums)>1);
            for l=2:length(date_nums);
                d_lon(l)=lons(l)-lons(l-1);
                d_lat(l)=lats(l)-lats(l-1);
                d_date(l)=date_nums(l)-date_nums(l-1);
            end
        
            d_dis=sqrt(d_lon.^2+d_lat.^2)*100000/(max_speed*0.514*d_date);
            aps=find(d_dis > 1.5);
            date_nums(aps)=[];
            lons(aps)=[];
            lats(aps)=[];
            mmsis(aps)=[];
            speeds(aps)=[];
            clear aps d_dis d_date d_lon d_lat
            
            aps=find(date_nums>datenum(year,month+1,1)*24*3600);
            date_nums(aps)=[];
            lons(aps)=[];
            lats(aps)=[];
            mmsis(aps)=[];
            speeds(aps)=[];
            clear aps d_dis d_date d_lon d_lat
        end
        
        
      if (length(date_nums)>1);
        date_num_new=[date_nums(1):10:date_nums(length(date_nums))];
        lon_new=interp1(date_nums,lons,date_num_new);
        lat_new=interp1(date_nums,lats,date_num_new);
      
        
        for t=1:length(date_num_new);
            apx=find(glon<lon_new(t));
            apy=find(glat>lat_new(t));
            xx(t)=apx(length(apx));
            yy(t)=apy(length(apy));
            clear apx apy;
        end
        
        
            

        for t=1:length(date_num_new)-1;

            if (xx(t)==xx(t+1) & yy(t)==yy(t+1));
                ship_time(xx(t),yy(t))=ship_time(xx(t),yy(t))+10;
            else
                
                slope=(lat_new(t+1)-lat_new(t))/(lon_new(t+1)-lon_new(t));
                
                s_line=lat_new(t)-lon_new(t)*slope;
                
                if (xx(t+1)~=xx(t) & yy(t+1)==yy(t));
                    if (xx(t+1)>xx(t));
                        x_c=glon(xx(t+1));
                    else
                        x_c=glon(xx(t));
                    end    
                  
                   y_c=s_line+slope*x_c;
                   
                   fir=sqrt((lon_new(t)-x_c).^2+(lat_new(t)-y_c).^2);
                   sec=sqrt((lon_new(t+1)-x_c).^2+(lat_new(t+1)-y_c).^2);
                   tl=fir+sec;
                   
                   if (fir > 0 & sec >0);
                      time_1=10*fir/tl;
                      time_2=10*sec/tl;
                   else
                       time_1=0;
                       time_2=0;
                   end
                   
                   ship_time(xx(t),yy(t))=ship_time(xx(t),yy(t))+time_1;
                   ship_time(xx(t+1),yy(t+1))=ship_time(xx(t+1),yy(t+1))+time_2;
                elseif (yy(t+1)~=yy(t) & xx(t+1)==xx(t));
                    if (yy(t+1)<yy(t));
                        y_c=glat(yy(t));
                    else
                        y_c=glat(yy(t+1));
                    end
                    
                    x_c=(y_c-s_line)/slope;

                   fir=sqrt((lon_new(t)-x_c).^2+(lat_new(t)-y_c).^2);
                   sec=sqrt((lon_new(t+1)-x_c).^2+(lat_new(t+1)-y_c).^2);
                   tl=fir+sec;
                   if (fir > 0 & sec >0);
                      time_1=10*fir/tl;
                      time_2=10*sec/tl;
                   else
                       time_1=0;
                       time_2=0;
                   end
                   
                   ship_time(xx(t),yy(t))=ship_time(xx(t),yy(t))+time_1;
                   ship_time(xx(t+1),yy(t+1))=ship_time(xx(t+1),yy(t+1))+time_2;
                elseif ( yy(t+1)~= yy(t) & xx(t+1)~= xx(t));
                    
                    
                       if (xx(t+1)>xx(t));
                           x_1=glon(xx(t+1));
                       else;
                           x_1=glon(xx(t));
                       end;
                      
                
                           y_1=s_line+slope*x_1;                
                       
                       if (y_1>glat(yy(t)+1) & y_1 < glat(yy(t)) );
                         
                           sec_1=sqrt((lon_new(t)-x_1).^2+(lat_new(t)-y_1).^2);
                           
                           if (yy(t+1)<yy(t));
                               y_2=glat(yy(t));
                           else;
                               y_2=glat(yy(t+1));
                           end;
                           
                           x_2=(y_2-s_line)/slope;
                           
                           sec_2=sqrt((x_2-x_1)^2+(y_2-y_1)^2);
                           
                           sec_3=sqrt((lon_new(t+1)-lon_new(t))^2+(lat_new(t+1)-lat_new(t))^2)-sec_2-sec_1;


                           if (sec_1 > 0 & sec_2>0 & sec_3 >0);
                               time_1=10*sec_1/(sec_1+sec_2+sec_3);
                               time_2=10*sec_2/(sec_1+sec_2+sec_3);
                               time_3=10*sec_3/(sec_1+sec_2+sec_3);
                           else
                               time_1=0;
                               time_2=0;
                               time_3=0;
                           end
                           
                           
                           ship_time(xx(t),yy(t))=ship_time(xx(t),yy(t))+time_1;
                           ship_time(xx(t+1),yy(t+1))=ship_time(xx(t+1),yy(t+1))+time_3;
                           if (lon_new(t+1)>lon_new(t));
                               ship_time(xx(t)+1,yy(t))=ship_time(xx(t)+1,yy(t))+time_2;
                           else;
                               ship_time(xx(t)-1,yy(t))=ship_time(xx(t)-1,yy(t))+time_2;
                           end;
                           
                           
                           
                           
                       else;
                           clear y_1 x_1
                           if(yy(t+1)>yy(t));
                               y_1=glat(yy(t+1));
                           else;
                               y_1=glat(yy(t));
                           end;

                           
                           
                           x_1=(y_1-s_line)/slope;
                           
                           sec_1=sqrt((lon_new(t)-x_1).^2+(lat_new(t)-y_1).^2);
                           
                           
                           if (lon_new(t+1)>lon_new(t));
                               x_2=glon(xx(t+1));
                           else;
                               x_2=glon(xx(t));
                           end;
                           
                           y_2=x_2*slope+s_line;
                           
                           sec_2=sqrt((x_2-x_1)^2+(y_2-y_1)^2);
                           
                           sec_3=sqrt((lon_new(t+1)-lon_new(t))^2+(lat_new(t+1)-lat_new(t))^2)-sec_2-sec_1;
    
                           
                           if (sec_1 > 0 & sec_2>0 & sec_3 >0);
                               time_1=10*sec_1/(sec_1+sec_2+sec_3);
                               time_2=10*sec_2/(sec_1+sec_2+sec_3);
                               time_3=10*sec_3/(sec_1+sec_2+sec_3);
                           else
                               time_1=0;
                               time_2=0;
                               time_3=0;
                           end
                           
                          
                           
                           ship_time(xx(t),yy(t))=ship_time(xx(t),yy(t))+time_1;
                           ship_time(xx(t+1),yy(t+1))=ship_time(xx(t+1),yy(t+1))+time_3;
                           if (lat_new(t+1)>lat_new(t));
                               ship_time(xx(t),yy(t)-1)=ship_time(xx(t),yy(t)+1)+time_2;
                           else;
                               if yy(t)-1~=0
                               ship_time(xx(t),yy(t)+1)=ship_time(xx(t),yy(t)-1)+time_2;
                               end
                           end;
                           
                       end;
                end;                  
            clear slope s_line x_c y_c fir sec sec_1 sec_2 sec_3
            clear time_1 time_2 time_3 tl y_1 y_2 x_1 x_2 y_3 x_3                           
            end
        end
                
      end
      clear lon_new lat_new lons lats date_nums date_num_new aps speeds mmsis
        
end   
  time_n=datenum(valid_name(n,21:30));
  netcdf.putVar(ncid,var_time,n-1,1,time_n);
  netcdf.putVar(ncid,var_shiptime,[0,0,n-1],[aaa,bbb,1],ship_time);
  clear ship_num ship_num_str lon lat mmsi date_num mmsin nn file1
  clear ship_time
end

  netcdf.close(ncid);
  %clear; clear all; close all;
  toc;
  
  clearvars -except month
end