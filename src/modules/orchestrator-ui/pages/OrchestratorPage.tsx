import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchConfigForm } from "../components/SearchConfigForm";
import { SearchConfigList } from "../components/SearchConfigList";
import { ListingsBrowser } from "../components/ListingsBrowser";
import { useToast } from "@/hooks/use-toast";

// Mock data - will be replaced with Supabase integration
const mockConfigs = [
  {
    id: "1",
    brand: "Honda",
    model: "Civic",
    qualifier: "Sport",
    subQualifier: "Manual",
    yearStart: "2018",
    yearEnd: "2023",
    priceThreshold: 15000,
    priceMultiplier: 1.5,
    location: "Denver, CO",
    isActive: true,
    createdAt: "2024-01-15T10:00:00Z",
    lastRun: "2024-01-20T14:30:00Z",
    listingCount: 12,
  },
  {
    id: "2", 
    brand: "Canon",
    model: "EOS R5",
    priceThreshold: 2500,
    priceMultiplier: 1.2,
    isActive: false,
    createdAt: "2024-01-10T09:00:00Z",
    listingCount: 3,
  },
];

const mockListings = [
  {
    id: "1",
    title: "2020 Honda Civic Sport Manual - Excellent Condition",
    price: 18500,
    location: "Denver, CO",
    distance: 15,
    source: "Facebook Marketplace",
    tier: 1 as const,
    url: "https://facebook.com/marketplace/item/123",
    imageUrl: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=400",
    postedAt: "2024-01-20T08:00:00Z",
    searchConfigId: "1",
    searchConfigName: "Honda Civic Sport Manual",
  },
  {
    id: "2",
    title: "Honda Civic Sport 2019 - Low Miles",
    price: 16900,
    location: "Boulder, CO",
    distance: 45,
    source: "Craigslist Denver",
    tier: 1 as const,
    url: "https://denver.craigslist.org/cto/123.html",
    postedAt: "2024-01-19T15:30:00Z",
    searchConfigId: "1",
    searchConfigName: "Honda Civic Sport Manual",
  },
  {
    id: "3",
    title: "Canon EOS R5 Body Only - Like New",
    price: 2800,
    location: "Colorado Springs, CO",
    distance: 85,
    source: "Photography Forum",
    tier: 2 as const,
    url: "https://photoforum.com/listing/456",
    postedAt: "2024-01-18T12:00:00Z",
    searchConfigId: "2",
    searchConfigName: "Canon EOS R5",
  },
];

export function OrchestratorPage() {
  const { toast } = useToast();
  const [configs, setConfigs] = useState(mockConfigs);
  const [listings] = useState(mockListings);
  const [editingConfig, setEditingConfig] = useState<any>(null);

  const handleConfigSubmit = (data: any) => {
    if (editingConfig) {
      // Update existing config
      setConfigs(prev => prev.map(config => 
        config.id === editingConfig.id 
          ? { ...config, ...data }
          : config
      ));
      setEditingConfig(null);
      toast({
        title: "Configuration Updated",
        description: "Search configuration has been updated successfully.",
      });
    } else {
      // Create new config
      const newConfig = {
        ...data,
        id: Date.now().toString(),
        isActive: true,
        createdAt: new Date().toISOString(),
        listingCount: 0,
      };
      setConfigs(prev => [...prev, newConfig]);
      toast({
        title: "Configuration Created", 
        description: "New search configuration has been created successfully.",
      });
    }
  };

  const handleConfigEdit = (config: any) => {
    setEditingConfig(config);
  };

  const handleConfigDelete = (id: string) => {
    setConfigs(prev => prev.filter(config => config.id !== id));
    toast({
      title: "Configuration Deleted",
      description: "Search configuration has been deleted.",
    });
  };

  const handleToggleActive = (id: string, isActive: boolean) => {
    setConfigs(prev => prev.map(config =>
      config.id === id ? { ...config, isActive } : config
    ));
    toast({
      title: isActive ? "Search Resumed" : "Search Paused",
      description: `Search configuration has been ${isActive ? "resumed" : "paused"}.`,
    });
  };

  const handleListingClick = (listing: any) => {
    // Open listing in new tab
    window.open(listing.url, '_blank');
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Haystack Hunter & Gatherer</h1>
        <p className="text-muted-foreground">
          Configure your searches and browse discovered listings across multiple marketplaces
        </p>
      </div>

      <Tabs defaultValue="configure" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="configure">Configure</TabsTrigger>
          <TabsTrigger value="searches">My Searches</TabsTrigger>
          <TabsTrigger value="listings">Browse Listings</TabsTrigger>
        </TabsList>

        <TabsContent value="configure" className="space-y-6">
          <div className="flex justify-center">
            <SearchConfigForm 
              onSubmit={handleConfigSubmit}
              initialData={editingConfig}
            />
          </div>
          {editingConfig && (
            <div className="flex justify-center">
              <button
                onClick={() => setEditingConfig(null)}
                className="text-sm text-muted-foreground underline"
              >
                Cancel editing
              </button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="searches" className="space-y-6">
          <SearchConfigList
            configs={configs}
            onEdit={handleConfigEdit}
            onDelete={handleConfigDelete}
            onToggleActive={handleToggleActive}
          />
        </TabsContent>

        <TabsContent value="listings" className="space-y-6">
          <ListingsBrowser
            listings={listings}
            onListingClick={handleListingClick}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}