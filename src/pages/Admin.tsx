import { AdminDashboard } from "@/modules/admin/components/AdminDashboard";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const Admin = () => {
  const handleBackToHaystacks = () => {
    window.open("https://haystacks.charliescheid.com", "_blank");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <Button 
          onClick={handleBackToHaystacks}
          variant="outline"
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Haystacks
        </Button>
      </div>
      <AdminDashboard />
    </div>
  );
};

export default Admin;