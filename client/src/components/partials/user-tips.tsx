import React from "react";

import { AlertCircle } from "lucide-react";

const UserTips = () => {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
      <div className="flex items-start space-x-3">
        <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="font-medium text-blue-900 mb-1">Usage Tips</h4>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>
              • Upload Excel files with trademark serial numbers in any column
            </li>
            <li>
              • Processing time depends on file size (approximately 1 minute per
              50 records)
            </li>
            <li>
              • You can download results as Excel files once processing is
              complete
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default UserTips;
