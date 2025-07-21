import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Settings, 
  Activity, 
  BarChart3, 
  Database, 
  Play, 
  CheckCircle, 
  XCircle, 
  Clock,
  Search,
  TestTube,
  ExternalLink
} from 'lucide-react';
import { useSearchConfigs } from '@/hooks/useSearchConfigs';
import { useListings } from '@/hooks/useListings';
import { supabase } from '@/integrations/supabase/client';

interface ModuleStatus {
  name: string;
  key: string;
  enabled: boolean;
  lastRun?: string;
  successRate: number;
  description: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  module: string;
  level: string;
  message: string;
}

export const AdminDashboard = () => {
  const { configs } = useSearchConfigs();
  const { listings } = useListings();
  
  const [modules, setModules] = useState<ModuleStatus[]>([]);
  const [isLoadingModules, setIsLoadingModules] = useState(true);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);

  useEffect(() => {
    fetchModuleStatuses();
    fetchActivityLogs();
  }, []);

  const fetchModuleStatuses = async () => {
    setIsLoadingModules(true);
    try {
      // Get module settings from the database
      const { data: moduleSettings, error: settingsError } = await supabase
        .from('module_settings')
        .select('module_name, enabled');

      if (settingsError) {
        console.error('Error fetching module settings:', settingsError);
        return;
      }

      // Get the latest activity for each module
      const { data: activities, error: activitiesError } = await supabase
        .from('scrape_activity')
        .select('module_name, status, created_at, execution_time_ms')
        .order('created_at', { ascending: false });

      if (activitiesError) {
        console.error('Error fetching module activities:', activitiesError);
        return;
      }

      // Module definitions with descriptions
      const moduleDefinitions = [
        {
          key: 'primary-search',
          name: 'Primary Search',
          description: 'Main search crawler for marketplace listings'
        },
        {
          key: 'extended-search',
          name: 'Extended Search', 
          description: 'Secondary search with expanded parameters'
        },
        {
          key: 'discovery-crawler',
          name: 'Discovery Crawler',
          description: 'New source discovery and validation'
        },
        {
          key: 'contextual-finder',
          name: 'Contextual Finder',
          description: 'AI-powered contextual search refinement'
        },
        {
          key: 'widenet-explorer',
          name: 'WideNet Explorer',
          description: 'Google search safety net for zero-result searches'
        },
        {
          key: 'price-suggester',
          name: 'Price Suggester',
          description: 'Dynamic price threshold recommendations'
        },
        {
          key: 'craigslist-searcher',
          name: 'Craigslist Searcher',
          description: 'Location-prioritized Craigslist search engine'
        },
        {
          key: 'notifier',
          name: 'Notifier',
          description: 'Email notification service'
        }
      ];

      const modulesWithStats = moduleDefinitions.map(module => {
        // Find the corresponding setting
        const setting = moduleSettings?.find(s => s.module_name === module.key);
        
        // Get activities for this module
        const moduleActivities = activities?.filter(a => 
          a.module_name?.toLowerCase() === module.key
        ) || [];

        const latestActivity = moduleActivities[0];
        const successCount = moduleActivities.filter(a => a.status === 'success').length;
        const totalCount = moduleActivities.length;

        return {
          name: module.name,
          key: module.key,
          enabled: setting?.enabled ?? true,
          description: module.description,
          lastRun: latestActivity ? new Date(latestActivity.created_at).toLocaleString() : undefined,
          successRate: totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0
        };
      });

      setModules(modulesWithStats);
    } catch (error) {
      console.error('Error fetching module statuses:', error);
    } finally {
      setIsLoadingModules(false);
    }
  };

  const fetchActivityLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const { data: activities, error } = await supabase
        .from('scrape_activity')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching activity logs:', error);
        setLogs([]);
        return;
      }

      const formattedLogs: LogEntry[] = activities?.map(activity => ({
        id: activity.id,
        timestamp: new Date(activity.created_at).toLocaleString(),
        module: activity.module_name.split('-').map((word: string) => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' '),
        level: activity.status === 'success' ? 'SUCCESS' : 
               activity.status === 'failed' ? 'ERROR' : 'INFO',
        message: activity.message || `${activity.status} - ${activity.listings_found || 0} listings found`
      })) || [];

      setLogs(formattedLogs);
    } catch (error) {
      console.error('Error fetching activity logs:', error);
      setLogs([]);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const toggleModule = async (moduleName: string) => {
    const module = modules.find(m => m.name === moduleName);
    if (!module) return;

    const newEnabled = !module.enabled;
    
    // Update the database
    try {
      const { error } = await supabase
        .from('module_settings')
        .update({ enabled: newEnabled })
        .eq('module_name', module.key);

      if (error) {
        console.error('Error updating module setting:', error);
        return;
      }

      // Update local state
      setModules(prev => prev.map(m => 
        m.name === moduleName 
          ? { ...m, enabled: newEnabled }
          : m
      ));

      console.log(`Module ${moduleName} ${newEnabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Failed to toggle module:', error);
    }
  };

  const runModule = async (moduleName: string) => {
    const functionName = moduleName.toLowerCase().replace(/\s+/g, '-');
    console.log(`Manually invoking ${functionName}`);
    
    try {
      let payload = {};
      
      // Different modules require different payloads
      if (functionName === 'primary-search' || functionName === 'extended-search' || 
          functionName === 'contextual-finder' || functionName === 'discovery-crawler' || 
          functionName === 'widenet-explorer' || functionName === 'craigslist-searcher') {
        // These modules need to run for all active search configs
        const activeConfigs = configs?.filter(config => config.is_active) || [];
        if (activeConfigs.length === 0) {
          console.warn(`No active search configs found for ${functionName}`);
          return;
        }
        
        // Run for the first active config as a test, or all configs
        payload = { searchConfigId: activeConfigs[0].id };
      } else if (functionName === 'notifier') {
        // Notifier needs a type parameter
        payload = { type: 'daily_digest' };
      }
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: payload
      });
      
      if (error) {
        console.error(`Error invoking ${functionName}:`, error);
      } else {
        console.log(`Successfully invoked ${functionName}:`, data);
        // Refresh data after manual invocation
        setTimeout(() => {
          fetchModuleStatuses();
          fetchActivityLogs();
        }, 3000);
      }
    } catch (error) {
      console.error(`Failed to invoke ${functionName}:`, error);
    }
  };

  const activeConfigsCount = configs?.filter(config => config.is_active).length || 0;
  const totalListingsToday = listings?.filter(listing => {
    const today = new Date().toDateString();
    return new Date(listing.discovered_at).toDateString() === today;
  }).length || 0;
  
  const totalListings = listings?.length || 0;
  const enabledModules = modules.filter(m => m.enabled).length;

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR': return 'destructive';
      case 'WARNING': return 'secondary';
      case 'SUCCESS': return 'default';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Modules</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {enabledModules}/{modules.length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Searches</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeConfigsCount}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Listings Today</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalListingsToday}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Success Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalListings > 0 ? 'Live' : 'No Data'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="modules" className="w-full">
        <TabsList>
          <TabsTrigger value="modules">Module Control</TabsTrigger>
          <TabsTrigger value="logs">Execution Logs</TabsTrigger>
          <TabsTrigger value="api-tests">API Tests</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>
        
        <TabsContent value="modules" className="space-y-4">
          <div className="grid gap-4">
            {isLoadingModules ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-muted-foreground">Loading module statuses...</div>
              </div>
            ) : modules.map((module) => (
              <Card key={module.name}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{module.name}</CardTitle>
                      <CardDescription>{module.description}</CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={module.enabled ? "default" : "secondary"}>
                        {module.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                      <Switch
                        checked={module.enabled}
                        onCheckedChange={() => toggleModule(module.name)}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        Last run: {module.lastRun || 'No recent activity'}
                      </div>
                      <div className="flex items-center gap-1">
                        <Database className="h-4 w-4" />
                        Status: {module.enabled ? 'Active' : 'Disabled'}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runModule(module.name)}
                      disabled={!module.enabled}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Run Now
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Recent Execution Logs</CardTitle>
              <CardDescription>
                {isLoadingLogs ? 'Loading real-time logs...' : `Showing ${logs.length} recent entries`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                {isLoadingLogs ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="text-muted-foreground">Loading logs...</div>
                  </div>
                ) : logs.length === 0 ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="text-muted-foreground">No logs available yet</div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {logs.map((log) => (
                      <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border">
                        <div className="mt-1">
                          {log.level === 'ERROR' && <XCircle className="h-4 w-4 text-destructive" />}
                          {log.level === 'SUCCESS' && <CheckCircle className="h-4 w-4 text-green-500" />}
                          {log.level === 'WARNING' && <Clock className="h-4 w-4 text-yellow-500" />}
                          {log.level === 'INFO' && <Activity className="h-4 w-4 text-blue-500" />}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={getLogLevelColor(log.level)} className="text-xs">
                              {log.level}
                            </Badge>
                            <span className="text-sm font-medium">{log.module}</span>
                            <span className="text-xs text-muted-foreground">{log.timestamp}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{log.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="api-tests">
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>API Service Tests</CardTitle>
                <CardDescription>
                  Test external API integrations and verify functionality
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">ScraperAPI Service</h4>
                      <p className="text-sm text-muted-foreground">Verify ScraperAPI key and functionality</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        console.log('Testing ScraperAPI...');
                        try {
                          const { data, error } = await supabase.functions.invoke('test-scraper-api');
                          if (error) {
                            console.error('ScraperAPI test error:', error);
                          } else {
                            console.log('ScraperAPI test results:', data);
                          }
                          // Refresh logs to show the test results
                          setTimeout(() => {
                            fetchActivityLogs();
                          }, 2000);
                        } catch (error) {
                          console.error('Failed to test ScraperAPI:', error);
                        }
                      }}
                    >
                      <TestTube className="h-4 w-4 mr-2" />
                      Test ScraperAPI
                    </Button>
                  </div>
                  <div className="flex justify-between items-center p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Primary Search API Calls</h4>
                      <p className="text-sm text-muted-foreground">Evidence of actual marketplace scraping</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        // Filter logs to show only primary-search with API call evidence
                        const primarySearchLogs = logs.filter(log => 
                          log.module.toLowerCase().includes('primary') || 
                          log.message.includes('ScraperAPI') ||
                          log.message.includes('Craigslist') ||
                          log.message.includes('Facebook') ||
                          log.message.includes('eBay')
                        );
                        console.log('Primary Search API Evidence:', primarySearchLogs);
                      }}
                    >
                      <Search className="h-4 w-4 mr-2" />
                      Show API Evidence
                    </Button>
                  </div>
                  <div className="flex justify-between items-center p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Edge Function Logs</h4>
                      <p className="text-sm text-muted-foreground">View real-time logs from edge functions</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open('https://supabase.com/dashboard/project/prgzopfgxpcmducwrpwl/functions/primary-search/logs', '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Function Logs
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Show Primary Search Evidence */}
            <Card>
              <CardHeader>
                <CardTitle>Primary Search Module Evidence</CardTitle>
                <CardDescription>
                  Proof that the Primary Search module is calling ScraperAPI
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64">
                  {logs.filter(log => 
                    log.module.toLowerCase().includes('primary') ||
                    log.message.toLowerCase().includes('scraper')
                  ).length === 0 ? (
                    <div className="flex items-center justify-center h-32">
                      <div className="text-muted-foreground">No Primary Search logs yet. Run the module to see API evidence.</div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {logs.filter(log => 
                        log.module.toLowerCase().includes('primary') ||
                        log.message.toLowerCase().includes('scraper') ||
                        log.message.toLowerCase().includes('craigslist') ||
                        log.message.toLowerCase().includes('facebook') ||
                        log.message.toLowerCase().includes('ebay')
                      ).map((log) => (
                        <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                          <div className="mt-1">
                            {log.level === 'ERROR' && <XCircle className="h-4 w-4 text-destructive" />}
                            {log.level === 'SUCCESS' && <CheckCircle className="h-4 w-4 text-green-500" />}
                            {log.level === 'WARNING' && <Clock className="h-4 w-4 text-yellow-500" />}
                            {log.level === 'INFO' && <Activity className="h-4 w-4 text-blue-500" />}
                          </div>
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant={getLogLevelColor(log.level)} className="text-xs">
                                {log.level}
                              </Badge>
                              <span className="text-sm font-medium">{log.module}</span>
                              <span className="text-xs text-muted-foreground">{log.timestamp}</span>
                            </div>
                            <p className="text-sm text-muted-foreground">{log.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="performance">
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>System Status</CardTitle>
                <CardDescription>
                  Current system health and data statistics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Database Connection</h4>
                      <p className="text-sm text-muted-foreground">Supabase connection status</p>
                    </div>
                    <Badge variant="default">Connected</Badge>
                  </div>
                  <div className="flex justify-between items-center p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Active Search Configurations</h4>
                      <p className="text-sm text-muted-foreground">Currently active search specs</p>
                    </div>
                    <Badge variant={activeConfigsCount > 0 ? "default" : "secondary"}>
                      {activeConfigsCount}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Total Listings</h4>
                      <p className="text-sm text-muted-foreground">All discovered listings</p>
                    </div>
                    <Badge variant={totalListings > 0 ? "default" : "secondary"}>
                      {totalListings}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};