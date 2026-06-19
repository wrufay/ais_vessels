clear ;clc;
% indir='/tank0/store0/sli/data/chedabucto_bay_2020/shiptime/';
% outdir='/tank0/store0/sli/figure/chedabucto_bay_modified_figures/';

indir='/home/xuj/sli/data/sab_csas_2024/vessel_density/';
indir = '/home/xuj/work/project/cabotStrait/vessel_density/';
outdir='/home/xuj/work/project/vesselDensity/figure/';
outdir='/home/xuj/work/project/cabotStrait/figure/'

addpath('/home/xuj/Documents/MATLAB/m_map');
%%%%%%%%%% If draw one day's data, just define time_begin=[####,##,##], and
%%%%%%%%%% time_end=[]; If draw one month data just define
%%%%%%%%%% time_begin=[####,##], and time_end=[]; If draw data for a
%%%%%%%%%% certain period, define both time_begin and time_end.

%%%%%%%%%% specify begin and end time
% time_begin=[2020,1,1];
% time_end=[2020,7,31];
% time_begin=[2020,1,1];
% time_end=[2021,4,30];

% time_begin=[2019,1,1];
% time_end=[2019,12,31];

% time_begin=[2020,1,1];
% time_end=[2020,12,31];

% time_begin=[2021,1,1];
% time_end=[2021,12,31];

% time_begin=[2022,1,1];
% time_end=[2022,12,31];

% time_begin=[2023,1,1];
% time_end=[2023,3,31];

% time_begin=[2015,1,1];
% time_end=[2015,12,31];

% time_begin=[2016,1,1];
% time_end=[2016,12,31];

% time_begin=[2017,7,1];
% time_end=[2017,12,31];

% time_begin=[2015,1,1];
% time_end=[2016,12,31];

time_begin=[2017,7,1];
time_end=[2023,3,31];

time_begin=[2022,1,1];
time_end=[2022,12,31];

% CBN 2022, M2220 
center_lat1=47+9.7142/60.0;
center_lon1=-60-23.5790/60;

% CSW 2022, M2221
center_lat2=47+22.7005/60.;
center_lon2=-60-17.9084/60;

% CS1 2022 M2222
center_lat3=47+26.0728/60;
center_lon3=-60- 3.1941/60;

% CS2 2022 M2223
center_lat4 = 47+29.39264/60;
center_lon4 = -59-48.4320/60;

% CS3 2022 M2224
center_lat5=47+32.7167/60;
center_lon5=-59-33.6495/60;


% CSE 2022 M2245
center_lat6=47+35.3992/60;
center_lon6=-59-18.7061/60;

lat0=[46.16 46.17 46.27 46.42 46.42 46.23 46.07 46.07 45.93 45.78 46.16];
lon0=[-59.65 -59.33 -59.33 -59.0 -58.67 -58.37 -58.53 -58.67 -58.67 -59.65 -59.65];


% center_lat=45.3615;
% center_lon=-61.1443;
interval=0.001;
if (length(time_begin)==2);
    type="month";
    year=time_begin(1);
    month=time_begin(2);
elseif(length(time_begin==3) & length(time_end)==0) ;
    type="day";
    year=time_begin(1);
    month=time_begin(2);
    day=time_begin(3);
elseif (length(time_begin==3) & length(time_end)==3);
    type="period";
    year=time_begin(1);
    month=time_begin(2);
    day=time_begin(3);
    
   
else
    disp('Please check time setting');
end


%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%55
% % % ship_density_map = get(gca,'Colormap');
% % % save('./colormap_purple.mat', 'ship_density_map');
load('./colormap.mat');
s_type=string(type);

if (type~='period');
    year_str=num2str(year,'%04d');
    month_str=num2str(month,'%02d');
   
    file=[indir,year_str,month_str,'_ship_time.nc'];
    ship_time=ncread(file,'ship_time');
    lat=ncread(file,'latitude');
    lon=ncread(file,'longitude');
    time=ncread(file,'time');

    [lo,la]=meshgrid(lat,lon);
    % 
    lon_km=-17/12.*la+85+40*17/12;
    lat_km=ones(size(la,1),size(la,2)).*111;



    % %  

    if (s_type=='month');
        sum_time=sum(ship_time(:,:,:),3);
        ship_density=sum_time./(length(time)*3600*(interval*interval*2.*lon_km.*lat_km));
        g=figure;
        set(gcf, 'Position',  [100, 100, 1600, 1000]);
        % m_proj('lambert','lons',[-61.5 -63],'lat',[44.8 44.2]);
        m_proj('lambert','lons',[-61.5 -58],'lat',[46 48.25]);

        colormap(ship_density_map);

        m_pcolor(la,lo,ship_density);shading flat;  
        set(gca,'FontSize',25);
        m_gshhs_i('patch',[.5 .5 .5],'edgecolor','none');
        %m_grid('linewi',2,'layer','top');
        m_grid('tickdir','out','linewi',2,'fontsize',20);
        caxis([0 5]);
        colorbar;
        title('Vessel Density Per Squre Kilometer Per Hour');
        saveas(g,[outdir,year_str,month_str,'.png']);
    elseif (s_type=='day');
        day_str=num2str(day,'%02d');
        date_num=datenum(year,month,day);
        apt=find(time==date_num);
        if (length(apt)==0);
            disp('data is missing for selected time');
        end;
        sum_time=(ship_time(:,:,apt));
        ship_density=sum_time./(1.0*3600*(interval*interval*2.*lon_km.*lat_km));
        g=figure;
        set(gcf, 'Position',  [100, 100, 1600, 1000]);
        m_proj('lambert','lons',[-72 -50],'lat',[40 52]);
        colormap(ship_density_map);

        m_pcolor(la,lo,ship_density);shading flat;  
        set(gca,'FontSize',25);
        m_gshhs_i('patch',[.5 .5 .5],'edgecolor','none');
        %m_grid('linewi',2,'layer','top');
        m_grid('tickdir','out','linewi',2,'fontsize',20);
        caxis([0 5]);
        colorbar;
        title('Vessel Density Per Squre Kilometer Per Hour');
        saveas(g,[outdir,year_str,month_str,day_str,'.png']);
    end
else
    
    year_str=num2str(year,'%04d');
    month_str=num2str(month,'%02d');

%     files=dir(fullfile([indir,'*.nc'])); % wrong for this case 
%     files=dir(fullfile([indir,year_str,month_str,'_ship_time.nc']));
%     files=dir(fullfile([indir,year_str,'*_ship_time.nc']));
    files=dir(fullfile([indir,'*.nc']));

% ,year_str,'-',month_str,'*.nc'

    name={files.name};
    valid_name=(char(name));
    num_file=size(valid_name,1);
    year=str2num(valid_name(:,1:4));
    month=str2num(valid_name(:,5:6));
   
    u_year=unique(year);
    u_month=unique(month);
%    u_month(2,:)=[1:4];
    date_num1=datenum(time_begin(1),time_begin(2),time_begin(3));
    date_num2=datenum(time_end(1),time_end(2),time_end(3));
   
   
    yy=1; mm=1;
    year_str=num2str(u_year(yy),'%04d');
    month_str=num2str(u_month(mm),'%02d');
    file=[indir,year_str,month_str,'_ship_time.nc'];
    lat=ncread(file,'latitude');
    lon=ncread(file,'longitude');
    [lo,la]=meshgrid(lat,lon);
    lat_km=-17/12.*la+85+40*17/12;
    lon_km=ones(size(la,1),size(la,2)).*111;

    sum_time=zeros(length(lon), length(lat));
    count=0;
%    for yy=1:length(u_year);
    for mm=1:num_file
%        for mm=1:length(u_month(yy));
%             year_str=num2str(u_year(yy),'%04d');
%             month_str=num2str(u_month(mm),'%02d');
%            file=[indir,year_str,month_str,'_ship_time.nc'];
            file=[indir,valid_name(mm,:)]
            ship_time1=ncread(file,'ship_time');
            time1=ncread(file,'time');
            apt=find((time1 > date_num1) & (time1 <date_num2));
           
            sum_time=sum_time+sum(ship_time1(:,:,apt),3);
            count=count+length(apt);
%        end
    end
    ship_density=sum_time./(count*24*36*(interval*interval*2.*lon_km.*lat_km));
    clear year_str month_str day_str
    
    g=figure;
    set(g, 'Visible', 'on');
    set(gcf, 'Position',  [100, 100, 1600, 1000]);
%     set(g, 'Visible', 'off');
%     set(gcf, 'Position',  [100, 100, 1400, 800]);
    %m_proj('lambert','lons',[-65 -58],'lat',[42 48]);
%     m_proj('lambert','lon',[-61.5 -60.8],'lat',[45.1667 45.67]);   %
%     Chebucto Bay 

%     m_proj('lambert','lon',[-61.5 -57],'lat',[45. 47.]);
    % m_proj('lambert','lon',[-60.5 -58],'lat',[45.5 47.]);

    m_proj('lambert','lons',[-61.5 -58],'lat',[46 48.25]);


    colormap(ship_density_map);

    m_pcolor(la,lo,ship_density);shading flat;  

%     set(gca,'FontSize',12);
    set(gca,'FontSize',18);
    
    m_gshhs_f('patch',[.5 .5 .5],'edgecolor','none');
      hold on;

%     m_grid('tickdir','out','linewi',2,'fontsize',12);
    m_grid('tickdir','out','linewi',2,'fontsize',18);
    caxis([0 0.05]);
   % colorbar;
%     hc=colorbar;
%     xlabel(hc,'%');
    c = colorbar;  
    c.Ruler.TickLabelFormat='%g%%'
    %m_ruler([.05 .35],0.1);
    m_ruler(0.15,[.05 0.32]);

    % m_plot(lon0,lat0,'-','linewi',2.25,'color','r');

    pt2=m_plot(center_lon1,center_lat1,'h','color','r','MarkerFaceColor','r','markersize',15);
    hold on;
    pt3=m_plot(center_lon2,center_lat2,'o','color','r','MarkerFaceColor','r','markersize',15);
    hold on;
    pt4=m_plot(center_lon3,center_lat3,'^','color','r','MarkerFaceColor','r','markersize',15);
    hold on;
    pt5=m_plot(center_lon4,center_lat4,'s','color','r','MarkerFaceColor','r','markersize',15);
% 
    hold on;
    pt6=m_plot(center_lon5,center_lat5,'diamond','color','y','MarkerFaceColor','r','markersize',15);
    hold on;

    pt7=m_plot(center_lon6,center_lat6,'pentagram','color','y','MarkerFaceColor','r','markersize',15);



%     
%     hold on;
%     
%     pt8=m_plot(center_lon7,center_lat7,'*','color','r','MarkerFaceColor','r','markersize',15);
% 
% 
%     %m_grid('linewi',2,'layer','top');
%     legend([pt2 pt3 pt4 pt5 pt6 pt7 pt8],'SABD','SAB','SABS','SABW','SCAT','SABD2016','SABS2016');

lat00 =[47.68108333      47.66639167     47.57606944     47.44808611     47.244625       47.09747778     47.00803333     47.24892778     47.4497 47.53468333     47.60154444  47.68108333];
lon00 = [-59.35540556 -59.62484444 -60.13664444 -60.46240278 -60.59813889 -60.58439444 -60.26483611 -60.21594444 -59.50900278 -59.23203056 -59.29420556 -59.35540556];


    pt8=m_patch(lon00, lat00, 'r', 'EdgeColor', 'k', 'FaceAlpha', 0.25);  % Red polygon with black edge and 50% transparency

    legend([pt2 pt3 pt4 pt5 pt6 pt7 pt8],'CBN','CSW','CS1','CS2','CS3','CSE','Traffic Region');

%     
%     legend([pt2 ],'SABD');

   %title('2019 January to 2019 July')
    %title('Vessel Density Per Squre Kilometer');
    year_begin=num2str(time_begin(1),'%04d');
    month_begin=num2str(time_begin(2),'%02d');
    day_begin=num2str(time_begin(3),'%02d');
   
    year_end=num2str(time_end(1),'%04d');
    month_end=num2str(time_end(2),'%02d');
    day_end=num2str(time_end(3),'%02d');
%     outname=[outdir,year_begin,month_begin,day_begin,'_to_',year_end,month_end,day_end,'_sab_2019.png'];
    outname=[outdir,year_begin,month_begin,day_begin,'_to_',year_end,month_end,day_end,'_cabotStrait_traffic','.png'];
%     print('-dpng','-r300',outname);
        print('-dpng','-r200',outname);

    %saveas(g,[outdir,year_begin,month_begin,day_begin,'_to_',year_end,month_end,day_end,'_vertical.png']);
end
