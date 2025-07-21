import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { SearchConfigForm } from "../components/SearchConfigForm";
import { SearchConfigList } from "../components/SearchConfigList";
import { ListingsBrowser } from "../components/ListingsBrowser";
import { LocationDisplay } from "@/components/LocationDisplay";
import { VersionDisplay } from "@/components/VersionDisplay";
import { Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { useSearchConfigs } from "@/hooks/useSearchConfigs";
import { useListings } from "@/hooks/useListings";

export function OrchestratorPage() {
  const { 
    configs, 
    loading: configsLoading, 
    createConfig, 
    updateConfig, 
    deleteConfig, 
    toggleActive 
  } = useSearchConfigs();
  
  const { 
    listings, 
    loading: listingsLoading 
  } = useListings();
  
  const [editingConfig, setEditingConfig] = useState<any>(null);

  const handleConfigSubmit = async (data: any) => {
    try {
      if (editingConfig) {
        // Update existing config
        await updateConfig(editingConfig.id, {
          brand: data.brand,
          model: data.model,
          qualifier: data.qualifier || null,
          sub_qualifier: data.subQualifier || null,
          year_start: data.yearStart ? parseInt(data.yearStart) : null,
          year_end: data.yearEnd ? parseInt(data.yearEnd) : null,
          price_threshold: data.priceThreshold,
          price_multiplier: data.priceMultiplier,
          location: data.location,
          email: data.email,
        });
        setEditingConfig(null);
      } else {
        // Create new config
        await createConfig({
          brand: data.brand,
          model: data.model,
          qualifier: data.qualifier || null,
          sub_qualifier: data.subQualifier || null,
          year_start: data.yearStart ? parseInt(data.yearStart) : null,
          year_end: data.yearEnd ? parseInt(data.yearEnd) : null,
          price_threshold: data.priceThreshold,
          price_multiplier: data.priceMultiplier,
          location: data.location,
          email: data.email,
          is_active: true,
        });
      }
    } catch (error) {
      // Error handling is done in the hooks
      console.error('Error submitting config:', error);
    }
  };

  const handleConfigEdit = (config: any) => {
    // Transform database config to form format
    const formConfig = {
      brand: config.brand,
      model: config.model,
      qualifier: config.qualifier || '',
      subQualifier: config.sub_qualifier || '',
      yearStart: config.year_start?.toString() || '',
      yearEnd: config.year_end?.toString() || '',
      priceThreshold: config.price_threshold,
      priceMultiplier: config.price_multiplier,
      location: config.location,
      email: config.email,
    };
    setEditingConfig({ ...config, ...formConfig });
  };

  const handleConfigDelete = async (id: string) => {
    try {
      await deleteConfig(id);
    } catch (error) {
      console.error('Error deleting config:', error);
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      await toggleActive(id, isActive);
    } catch (error) {
      console.error('Error toggling config:', error);
    }
  };

  const handleListingClick = (listing: any) => {
    // Open listing in new tab
    window.open(listing.url, '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      {/* Header with logo */}
      <div className="bg-card border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex-1" />
            <div className="flex items-center justify-center flex-1">
              <img 
                src="/lovable-uploads/97922417-e587-454d-802e-c6733c3a4d6f.png" 
                alt="Feed Me Haystacks" 
                className="max-h-16 w-auto"
              />
            </div>
            <div className="flex-1 flex items-center justify-end">
              <VersionDisplay />
            </div>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto py-6 space-y-6">
        <div className="text-center">
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
          <div className="bg-card rounded-lg border shadow-sm">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Build Your Haystack</h2>
                  <p className="text-muted-foreground mt-1">
                    Configure what you want me to search for
                  </p>
                </div>
                <LocationDisplay />
              </div>
            </div>
            <div className="p-6 flex justify-center">
              <SearchConfigForm 
                onSubmit={handleConfigSubmit}
                initialData={editingConfig}
              />
              {editingConfig && (
                <div className="flex justify-center mt-4">
                  <button
                    onClick={() => setEditingConfig(null)}
                    className="text-sm text-muted-foreground underline"
                  >
                    Cancel editing
                  </button>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="searches" className="space-y-6">
          <SearchConfigList
            configs={configs.map(config => ({
              id: config.id,
              brand: config.brand,
              model: config.model,
              qualifier: config.qualifier || undefined,
              subQualifier: config.sub_qualifier || undefined,
              yearStart: config.year_start?.toString(),
              yearEnd: config.year_end?.toString(),
              priceThreshold: config.price_threshold,
              priceMultiplier: config.price_multiplier,
              location: config.location,
              isActive: config.is_active,
              createdAt: config.created_at,
              lastRun: config.updated_at,
              listingCount: 0, // TODO: Add actual count from listings
            }))}
            loading={configsLoading}
            onEdit={handleConfigEdit}
            onDelete={handleConfigDelete}
            onToggleActive={handleToggleActive}
          />
        </TabsContent>

        <TabsContent value="listings" className="space-y-6">
          <ListingsBrowser
            listings={listings.map(listing => ({
              id: listing.id,
              title: listing.title,
              price: listing.price,
              location: listing.location,
              distance: listing.distance || 0,
              source: listing.source,
              tier: listing.tier as 1 | 2 | 3,
              url: listing.url,
              imageUrl: listing.image_url || undefined,
              postedAt: listing.posted_at,
              searchConfigId: listing.search_config_id,
              searchConfigName: listing.searchConfigName || '',
            }))}
            loading={listingsLoading}
            onListingClick={handleListingClick}
          />
        </TabsContent>
      </Tabs>
      </div>
      
      {/* Admin button at bottom of page */}
      <footer className="mt-12 py-8 border-t bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="flex justify-center">
            <Link to="/admin">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                <Settings className="h-4 w-4 mr-2" />
                Admin
              </Button>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}