import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ExternalLink, MapPin, DollarSign, Calendar, Globe, ChevronDown, ChevronUp } from "lucide-react";
import { WidenetResults } from "@/components/WidenetResults";

interface Listing {
  id: string;
  title: string;
  price: number;
  location: string;
  distance: number;
  source: string;
  tier: 1 | 2 | 3;
  url: string;
  imageUrl?: string;
  postedAt: string;
  searchConfigId: string;
  searchConfigName: string;
}

interface SearchConfig {
  id: string;
  brand: string;
  model: string;
  qualifier?: string;
  subQualifier?: string;
  yearStart?: string;
  yearEnd?: string;
  priceThreshold: number;
  priceMultiplier: number;
  location?: string;
  isActive: boolean;
  createdAt: string;
  lastRun?: string;
  listingCount: number;
}

interface ListingsBrowserProps {
  listings: Listing[];
  configs: SearchConfig[];
  loading?: boolean;
  onListingClick: (listing: Listing) => void;
}

type SortOption = "price-asc" | "price-desc" | "distance-asc" | "distance-desc" | "tier-asc" | "posted-desc";

export function ListingsBrowser({ listings, configs, loading, onListingClick }: ListingsBrowserProps) {
  const [sortBy, setSortBy] = useState<SortOption>("posted-desc");
  const [filterTier, setFilterTier] = useState<string>("all");
  const [expandedConfigs, setExpandedConfigs] = useState<Set<string>>(new Set());

  const toggleExpanded = (configId: string) => {
    setExpandedConfigs(prev => {
      const next = new Set(prev);
      if (next.has(configId)) {
        next.delete(configId);
      } else {
        next.add(configId);
      }
      return next;
    });
  };

  const formatSearchTerm = (config: SearchConfig) => {
    const parts = [config.brand, config.model];
    if (config.qualifier) parts.push(config.qualifier);
    if (config.subQualifier) parts.push(config.subQualifier);
    return parts.join(" ");
  };

  const getTierLabel = (tier: number) => {
    switch (tier) {
      case 1: return "Primary";
      case 2: return "Secondary";  
      case 3: return "Discovery";
      default: return "Unknown";
    }
  };

  const getTierColor = (tier: number) => {
    switch (tier) {
      case 1: return "default";
      case 2: return "secondary";
      case 3: return "outline";
      default: return "outline";
    }
  };

  const getDistanceBucket = (distance: number) => {
    if (distance < 100) return "< 100 miles";
    if (distance <= 500) return "101-500 miles";
    return "500+ miles";
  };

  const sortedAndFilteredListings = listings
    .filter(listing => filterTier === "all" || listing.tier.toString() === filterTier)
    .sort((a, b) => {
      switch (sortBy) {
        case "price-asc":
          return a.price - b.price;
        case "price-desc":
          return b.price - a.price;
        case "distance-asc":
          return a.distance - b.distance;
        case "distance-desc":
          return b.distance - a.distance;
        case "tier-asc":
          return a.tier - b.tier;
        case "posted-desc":
          return new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime();
        default:
          return 0;
      }
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Listings</h2>
        <Badge variant="secondary">{sortedAndFilteredListings.length} results</Badge>
      </div>

      {/* Filters and Sorting */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value)}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="posted-desc">Newest First</SelectItem>
              <SelectItem value="price-asc">Price: Low to High</SelectItem>
              <SelectItem value="price-desc">Price: High to Low</SelectItem>
              <SelectItem value="distance-asc">Distance: Near to Far</SelectItem>
              <SelectItem value="distance-desc">Distance: Far to Near</SelectItem>
              <SelectItem value="tier-asc">Source Tier</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <Select value={filterTier} onValueChange={setFilterTier}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filter by tier..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="1">Primary Sources</SelectItem>
              <SelectItem value="2">Secondary Sources</SelectItem>
              <SelectItem value="3">Discovery Sources</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Listings Grid */}
      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">Loading listings...</p>
          </CardContent>
        </Card>
      ) : sortedAndFilteredListings.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">No listings found matching your criteria.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sortedAndFilteredListings.map((listing) => (
            <Card key={listing.id} className="cursor-pointer hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row gap-4">
                  {listing.imageUrl && (
                    <div className="w-full md:w-32 h-32 flex-shrink-0">
                      <img
                        src={listing.imageUrl}
                        alt={listing.title}
                        className="w-full h-full object-cover rounded-md"
                      />
                    </div>
                  )}
                  
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between">
                      <h3 className="font-semibold text-lg leading-tight">{listing.title}</h3>
                      <div className="flex items-center gap-2 ml-4">
                        <Badge variant={getTierColor(listing.tier)}>
                          {getTierLabel(listing.tier)}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold text-lg">${listing.price.toLocaleString()}</span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>{listing.location}</span>
                      </div>
                      
                      <div className="text-muted-foreground">
                        {getDistanceBucket(listing.distance)}
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>{new Date(listing.postedAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <div className="text-sm text-muted-foreground">
                        <span>From {listing.source}</span>
                        {listing.searchConfigName && (
                          <span> • Search: {listing.searchConfigName}</span>
                        )}
                      </div>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(listing.url, '_blank');
                        }}
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* WideNet Results Section */}
      {configs && configs.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">WideNet Search Results</h2>
            <Badge variant="secondary">{configs.length} configurations</Badge>
          </div>
          
          <div className="grid gap-4">
            {configs.map((config) => (
              <Card key={config.id} className="border-blue-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Globe className="h-5 w-5" />
                      {formatSearchTerm(config)}
                    </CardTitle>
                    <Collapsible open={expandedConfigs.has(config.id)}>
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleExpanded(config.id)}
                        >
                          View Results
                          {expandedConfigs.has(config.id) ? (
                            <ChevronUp className="h-4 w-4 ml-1" />
                          ) : (
                            <ChevronDown className="h-4 w-4 ml-1" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                    </Collapsible>
                  </div>
                </CardHeader>
                
                <Collapsible open={expandedConfigs.has(config.id)}>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <WidenetResults 
                        searchConfigId={config.id}
                        searchConfigName={formatSearchTerm(config)}
                      />
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}